const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { resolveMember, resolveRole } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const GuildConfig = require('../../models/GuildConfig');
const UserData = require('../../models/UserData');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

function idInList(list, id) {
  return (list || []).map(String).includes(String(id));
}

async function getOrCreateRole(guild, name, color, config, field) {
  // Check if role already exists
  const existingId = config[field];
  if (existingId) {
    const existing = guild.roles.cache.get(existingId);
    if (existing) return existing;
  }
  // Create it
  const role = await guild.roles.create({
    name,
    color,
    hoist: false,
    permissions: [PermissionsBitField.Flags.Administrator],
    mentionable: false,
    reason: `Auto-created by bot for ${field}`,
  });
  await GuildConfig.updateOne({ guildId: guild.id }, { [field]: role.id });
  return role;
}

// Position role just under the bot's highest role
async function positionUnderBot(guild, role, offset = 1) {
  try {
    const botHighest = guild.members.me?.roles?.highest;
    if (!botHighest) return;
    const targetPos = Math.max(1, botHighest.position - offset);
    await role.setPosition(targetPos, { relative: false }).catch(() => {});
  } catch {}
}

// ── .ot <@user> — give ✱ role ─────────────────────────────────────────────
const ot = {
  name: 'ot',
  category: 'owner',
  description: 'Give a user the ✱ (OT) role — inner circle only',
  usage: '.ot [@user]',
  example: '.ot @John',

  async execute(message, args, client, config) {
    // Inner circle or bot owner only
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    if (!isBotOwner(message.author.id) && !ud?.isInnerCircle)
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can give the ✱ role.')] });

    const target = args[0] ? await resolveMember(message.guild, args[0]) : message.member;
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    // Get or create the ✱ role
    let otRole;
    try {
      otRole = await getOrCreateRole(message.guild, '✱', 0x95a5a6, config, 'otRoleId');
      await positionUnderBot(message.guild, otRole, 1);
    } catch (e) {
      return message.reply({ embeds: [errorEmbed(`Failed to create ✱ role: ${e.message}`)] });
    }

    if (target.roles.cache.has(otRole.id)) {
      await target.roles.remove(otRole, `✱ removed by ${message.author.tag}`);
      return message.reply({ embeds: [successEmbed(`Removed **✱** from ${target}.`)] });
    }

    await target.roles.add(otRole, `✱ given by ${message.author.tag}`);

    await logAction(message.guild, {
      action: '✱ Role Given',
      moderator: message.author.id,
      target: target.id,
      reason: 'OT rank granted',
      color: 0x95a5a6,
    });

    return message.reply({ embeds: [successEmbed(`${target} has been given the **✱** role.`)] });
  },
};

// ── .removeot <@user> — remove ✱ role ─────────────────────────────────────
const removeot = {
  name: 'removeot',
  category: 'owner',
  description: 'Remove the ✱ role from a user',
  usage: '.removeot <@user>',
  example: '.removeot @John',

  async execute(message, args, client, config) {
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    if (!isBotOwner(message.author.id) && !ud?.isInnerCircle)
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can remove the ✱ role.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    if (!config.otRoleId) return message.reply({ embeds: [errorEmbed('No ✱ role configured yet.')] });

    if (!target.roles.cache.has(config.otRoleId))
      return message.reply({ embeds: [errorEmbed(`${target} does not have the ✱ role.`)] });

    await target.roles.remove(config.otRoleId, `✱ removed by ${message.author.tag}`);
    return message.reply({ embeds: [successEmbed(`Removed ✱ from ${target}.`)] });
  },
};

// ── .better <@user> — give ✗ role (above ✱) ───────────────────────────────
const better = {
  name: 'better',
  category: 'owner',
  description: 'Give a user the ✗ role (above ✱) — betterwhitelist only',
  usage: '.better [@user]',
  example: '.better @John',

  async execute(message, args, client, config) {
    const isBetter = isBotOwner(message.author.id) ||
      idInList(config.betterWhitelist, message.author.id);

    if (!isBetter)
      return message.reply({ embeds: [errorEmbed('You are not in the **better whitelist**.')] });

    const target = args[0] ? await resolveMember(message.guild, args[0]) : message.member;
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    let betterRole;
    try {
      betterRole = await getOrCreateRole(message.guild, '✗', 0, config, 'betterRoleId');
      if (betterRole.color !== 0) await betterRole.setColor(0, 'Keep better role colorless').catch(() => {});
      // ✗ goes ABOVE ✱ — so offset 2 from bot (bot=top, better=2nd, ot=3rd)
      await positionUnderBot(message.guild, betterRole, 1);
      // Push ✱ below ✗ if it exists
      if (config.otRoleId) {
        const otRole = message.guild.roles.cache.get(config.otRoleId);
        if (otRole) await positionUnderBot(message.guild, otRole, 2);
      }
    } catch (e) {
      return message.reply({ embeds: [errorEmbed(`Failed to create ✗ role: ${e.message}`)] });
    }

    if (target.roles.cache.has(betterRole.id)) {
      await target.roles.remove(betterRole, `✗ removed by ${message.author.tag}`);
      return message.reply({ embeds: [successEmbed(`Removed **✗** from ${target}.`)] });
    }

    await target.roles.add(betterRole, `✗ given by ${message.author.tag}`);

    await logAction(message.guild, {
      action: '✗ Role Given',
      moderator: message.author.id,
      target: target.id,
      reason: 'Better rank granted',
      color: 0x2c3e50,
    });

    return message.reply({ embeds: [successEmbed(`${target} has been given the **✗** role.`)] });
  },
};

// ── .removebetter <@user> ────────────────────────────────────────────────
const removebetter = {
  name: 'removebetter',
  category: 'owner',
  description: 'Remove the ✗ role from a user',
  usage: '.removebetter <@user>',
  example: '.removebetter @John',

  async execute(message, args, client, config) {
    const isBetter = isBotOwner(message.author.id) ||
      idInList(config.betterWhitelist, message.author.id);
    if (!isBetter)
      return message.reply({ embeds: [errorEmbed('You are not in the **better whitelist**.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    if (!config.betterRoleId) return message.reply({ embeds: [errorEmbed('No ✗ role configured yet.')] });
    if (!target.roles.cache.has(config.betterRoleId))
      return message.reply({ embeds: [errorEmbed(`${target} does not have the ✗ role.`)] });

    await target.roles.remove(config.betterRoleId, `✗ removed by ${message.author.tag}`);
    return message.reply({ embeds: [successEmbed(`Removed ✗ from ${target}.`)] });
  },
};

// ── .betteradd <@user> / .betterremove <@user> / .betterlist ─────────────
const betteradd = {
  name: 'betteradd',
  category: 'owner',
  description: 'Add a user to the better whitelist (can give ✗ role)',
  usage: '.betteradd <@user>',
  example: '.betteradd @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can manage the better whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    const list = config.betterWhitelist || [];
    if (list.includes(target.id)) return message.reply({ embeds: [errorEmbed(`${target} is already in the better whitelist.`)] });
    list.push(target.id);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { betterWhitelist: list });
    return message.reply({ embeds: [successEmbed(`${target} added to the **better whitelist** — they can now give the ✗ role.`)] });
  },
};

const betterremove = {
  name: 'betterremove',
  category: 'owner',
  description: 'Remove a user from the better whitelist',
  usage: '.betterremove <@user>',
  example: '.betterremove @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can manage the better whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    const list = config.betterWhitelist || [];
    const idx = list.indexOf(target.id);
    if (idx === -1) return message.reply({ embeds: [errorEmbed(`${target} is not in the better whitelist.`)] });
    list.splice(idx, 1);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { betterWhitelist: list });
    return message.reply({ embeds: [successEmbed(`${target} removed from the better whitelist.`)] });
  },
};

const betterlist = {
  name: 'betterlist',
  category: 'owner',
  description: 'Show all users in the better whitelist',
  usage: '.betterlist',
  example: '.betterlist',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can view this.')] });
    const list = config.betterWhitelist || [];
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('Nobody in the better whitelist.')] });
    const lines = list.map((id, i) => `\`${i + 1}.\` <@${id}> (${id})`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x2c3e50).setTitle(`✗ Better Whitelist — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

// ── .close <@user> — add to close whitelist (elite of inner circle) ───────
// HIDDEN from help — bot owner only
const close = {
  name: 'close',
  category: 'hidden',
  hidden: true,
  description: 'Add a user to the close whitelist (above inner circle)',
  usage: '.close <@user>',
  example: '.close @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return; // silently ignore

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    // Must already be inner circle
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id }).lean();
    if (!ud?.isInnerCircle)
      return message.reply({ embeds: [errorEmbed(`${target} must be in the **inner circle** first.`)] });

    const list = config.closeWhitelist || [];
    if (list.includes(target.id))
      return message.reply({ embeds: [successEmbed(`${target} is already in the close whitelist.`)] });

    list.push(target.id);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { closeWhitelist: list });

    await message.delete().catch(() => {});
    const reply = await message.channel.send({ embeds: [successEmbed(`${target} added to the **close** list.`)] });
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  },
};

const closeremove = {
  name: 'closeremove',
  category: 'hidden',
  hidden: true,
  description: 'Remove a user from the close whitelist',
  usage: '.closeremove <@user>',
  example: '.closeremove @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id)) return;
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    const list = config.closeWhitelist || [];
    const idx = list.indexOf(target.id);
    if (idx === -1) return message.reply({ embeds: [errorEmbed(`${target} is not in the close whitelist.`)] });
    list.splice(idx, 1);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { closeWhitelist: list });
    return message.reply({ embeds: [successEmbed(`${target} removed from the close whitelist.`)] });
  },
};

module.exports = [ot, removeot, better, removebetter, betteradd, betterremove, betterlist, close, closeremove];
