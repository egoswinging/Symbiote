const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

const VANISH_DENY = {
  ViewChannel: false,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  Connect: false,
  Speak: false,
  Stream: false,
  UseVAD: false,
};

// Helper — delete command message + reply after delay
async function silentReply(message, embed, delay = 3000) {
  await message.delete().catch(() => {});
  const reply = await message.channel.send({ embeds: [embed] });
  setTimeout(() => reply.delete().catch(() => {}), delay);
}

async function applyVanishOverwrites(guild, role, reason = 'Apply vanish permissions') {
  await guild.channels.fetch().catch(() => {});

  let done = 0;
  let failed = 0;
  for (const [, ch] of guild.channels.cache) {
    if (!ch?.permissionOverwrites?.edit) continue;
    try {
      await ch.permissionOverwrites.edit(role, VANISH_DENY, { reason });
      done++;
    } catch {
      failed++;
    }
  }

  return { done, failed };
}

const vanish = {
  name: 'vanish',
  category: 'moderation',
  description: 'Remove all roles and apply vanish role',
  usage: '.vanish @user [reason]',
  example: '.vanish @John being disruptive',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });
    if (!config.vanishRole)
      return message.reply({ embeds: [errorEmbed('No vanish role set. Use `.setrole vanish @role`')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot target someone with equal or higher permissions.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';

    const roleIds = target.roles.cache
      .filter(r => r.id !== message.guild.id)
      .map(r => r.id);

    await target.roles.set([message.guild.id], `Vanished by ${message.author.tag}`);
    await target.roles.add(config.vanishRole).catch(() => {});

    const vanishRole = message.guild.roles.cache.get(config.vanishRole);
    if (vanishRole) {
      await applyVanishOverwrites(message.guild, vanishRole, `Vanish permissions by ${message.author.tag}`);
    }

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isVanished: true, vanishedRoles: roleIds },
      { upsert: true }
    );

    await logAction(message.guild, { action: 'Vanish', moderator: message.author.id, target: target.id, reason, color: 0xFEE75C });
    await silentReply(message, successEmbed(`${target} has been **vanished**.`));
  },
};

const unvanish = {
  name: 'unvanish',
  category: 'moderation',
  description: 'Remove the vanish role (roles NOT restored — use .restorevanish)',
  usage: '.unvanish @user',
  example: '.unvanish @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id });
    if (!ud?.isVanished)
      return message.reply({ embeds: [errorEmbed('That user is not vanished.')] });

    if (config.vanishRole) await target.roles.remove(config.vanishRole).catch(() => {});

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isVanished: false }
    );

    await logAction(message.guild, { action: 'Unvanish', moderator: message.author.id, target: target.id, reason: 'Vanish role removed', color: 0x57F287 });
    await silentReply(message, successEmbed(`${target} has been **unvanished**. Use \`.restorevanish\` to restore their roles.`));
  },
};

const restorevanish = {
  name: 'restorevanish',
  category: 'moderation',
  description: 'Restore all roles a user had before being vanished',
  usage: '.restorevanish @user',
  example: '.restorevanish @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id });
    if (!ud?.vanishedRoles?.length)
      return message.reply({ embeds: [errorEmbed('No saved vanish roles found for that user.')] });

    const valid = ud.vanishedRoles.filter(id => {
      const r = message.guild.roles.cache.get(id);
      return r && !r.managed;
    });

    if (valid.length) await target.roles.add(valid).catch(() => {});

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { vanishedRoles: [] }
    );

    await logAction(message.guild, { action: 'Restore Vanish Roles', moderator: message.author.id, target: target.id, reason: `Restored ${valid.length} roles`, color: 0x57F287 });
    await silentReply(message, successEmbed(`Restored **${valid.length}** roles to ${target}.`));
  },
};

const vanishlist = {
  name: 'vanishlist',
  category: 'moderation',
  description: 'Show all vanished users',
  usage: '.vanishlist',
  example: '.vanishlist',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const list = await UserData.find({ guildId: message.guild.id, isVanished: true });
    if (!list.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No vanished users.')] });

    const lines = list.map((ud, i) => `\`${i + 1}.\` <@${ud.userId}> (${ud.userId})`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`👻 Vanished Users — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

const setupvanish = {
  name: 'setupvanish',
  category: 'moderation',
  description: 'Apply vanish role deny perms to every channel',
  usage: '.setupvanish',
  example: '.setupvanish',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can run this.')] });
    if (!config.vanishRole)
      return message.reply({ embeds: [errorEmbed('Set a vanish role first with `.setrole vanish @role`')] });

    const role = message.guild.roles.cache.get(config.vanishRole);
    if (!role) return message.reply({ embeds: [errorEmbed('Vanish role not found.')] });

    const status = await message.reply({ embeds: [{ color: 0x5865F2, description: '⏳ Applying overwrites...' }] });
    const { done, failed } = await applyVanishOverwrites(message.guild, role, `setupvanish by ${message.author.tag}`);
    const failedText = failed ? `\nCould not update **${failed}** channels. Check the bot has **Manage Channels** and its role is high enough.` : '';
    await status.edit({ embeds: [successEmbed(`Applied vanish overwrites to **${done}** channels/categories.${failedText}`)] });
  },
};

module.exports = [vanish, unvanish, restorevanish, vanishlist, setupvanish];
