const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

const vanish = {
  name: 'vanish',
  category: 'moderation',
  description: 'Vanish a user — removes all roles and applies the vanish role',
  usage: '.vanish <@user> [reason]',
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

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isVanished: true, vanishedRoles: roleIds },
      { upsert: true }
    );

    await logAction(message.guild, { action: 'Vanish', moderator: message.author.id, target: target.id, reason, color: 0xFEE75C });
    return message.reply({ embeds: [successEmbed(`${target} has been **vanished**.`)] });
  },
};

// .unvanish — ONLY removes the vanish role, does NOT restore roles
const unvanish = {
  name: 'unvanish',
  category: 'moderation',
  description: 'Remove the vanish role from a user (roles not restored — use .restorevanish for that)',
  usage: '.unvanish <@user>',
  example: '.unvanish @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id });
    if (!ud?.isVanished)
      return message.reply({ embeds: [errorEmbed('That user is not vanished.')] });

    // ONLY remove vanish role — do NOT restore any roles
    if (config.vanishRole) {
      await target.roles.remove(config.vanishRole).catch(() => {});
    }

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isVanished: false }
      // intentionally NOT clearing vanishedRoles — restorevanish needs them
    );

    await logAction(message.guild, { action: 'Unvanish', moderator: message.author.id, target: target.id, reason: 'Vanish role removed (roles NOT restored)', color: 0x57F287 });
    return message.reply({ embeds: [successEmbed(`${target} has been **unvanished**. Use \`.restorevanish\` to give back their roles.`)] });
  },
};

// .restorevanish — restores saved roles after unvanish
const restorevanish = {
  name: 'restorevanish',
  category: 'moderation',
  description: 'Restore all roles a user had before being vanished',
  usage: '.restorevanish <@user>',
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
    return message.reply({ embeds: [successEmbed(`Restored **${valid.length}** roles to ${target}.`)] });
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
  description: 'Apply vanish role permission overwrites across ALL channels',
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
    let done = 0;
    for (const [, ch] of message.guild.channels.cache.filter(c => c.type !== 4)) {
      await ch.permissionOverwrites.edit(role, { ViewChannel: false, SendMessages: false, Connect: false }).catch(() => {});
      done++;
    }
    return status.edit({ embeds: [successEmbed(`Applied vanish overwrites to **${done}** channels.`)] });
  },
};

module.exports = [vanish, unvanish, restorevanish, vanishlist, setupvanish];
