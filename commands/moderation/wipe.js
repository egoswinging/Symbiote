const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

async function restoreSavedRoles(member, roleIds, reason) {
  await member.guild.roles.fetch().catch(() => {});
  const restored = [];
  const failed = [];
  const seen = new Set();

  for (const id of roleIds || []) {
    const roleId = String(id);
    if (seen.has(roleId) || roleId === member.guild.id || member.roles.cache.has(roleId)) continue;
    seen.add(roleId);

    const role = member.guild.roles.cache.get(roleId);
    if (!role || role.managed) continue;

    try {
      await member.roles.add(role, reason);
      restored.push(roleId);
    } catch {
      failed.push(roleId);
    }
  }

  return { restored, failed };
}

// .wipe — BAN the user (renamed from ban)
const wipe = {
  name: 'wipe',
  category: 'moderation',
  description: 'Ban a user from the server',
  usage: '.wipe <@user|id> [reason]',
  example: '.wipe @John breaking rules',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v1', config))
      return message.reply({ embeds: [errorEmbed('You need **v1** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot target someone with equal or higher permissions.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const savedRoles = target.roles.cache
      .filter(r => r.id !== message.guild.id && !r.managed)
      .map(r => r.id);

    try {
      await message.guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
    } catch {
      return message.reply({ embeds: [errorEmbed('Failed to ban — check my permissions and role position.')] });
    }

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isWiped: true, savedRoles, $push: { punishments: { type: 'wipe/ban', reason, moderator: message.author.id } } },
      { upsert: true }
    );

    await logAction(message.guild, { action: 'Wipe (Ban)', moderator: message.author.id, target: target.id, reason });
    return message.reply({ embeds: [successEmbed(`**${target.user.tag}** has been **wiped** (banned).\n**Reason:** ${reason}`)] });
  },
};

// .unwipe — UNBAN the user
const unwipe = {
  name: 'unwipe',
  category: 'moderation',
  description: 'Unban a wiped user',
  usage: '.unwipe <userID>',
  example: '.unwipe 123456789012345678',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v1', config))
      return message.reply({ embeds: [errorEmbed('You need **v1** or higher.')] });

    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId || !/^\d{17,20}$/.test(userId))
      return message.reply({ embeds: [errorEmbed('Provide a valid user ID.')] });

    try {
      await message.guild.members.unban(userId, `Unwiped by ${message.author.tag}`);
    } catch {
      return message.reply({ embeds: [errorEmbed('Could not unban that user — they may not be banned.')] });
    }

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId },
      { isWiped: false }
    );

    await logAction(message.guild, { action: 'Unwipe (Unban)', moderator: message.author.id, target: userId, reason: 'User unbanned', color: 0x57F287 });
    return message.reply({ embeds: [successEmbed(`User \`${userId}\` has been **unwiped** (unbanned).`)] });
  },
};

// .wipelist — show all wiped/banned users tracked in DB
const wipelist = {
  name: 'wipelist',
  category: 'moderation',
  description: 'Show all wiped (banned) users',
  usage: '.wipelist',
  example: '.wipelist',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const list = await UserData.find({ guildId: message.guild.id, isWiped: true });
    if (!list.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No wiped users.')] });

    const lines = list.map((ud, i) => `\`${i + 1}.\` <@${ud.userId}> (${ud.userId})`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xEB459E).setTitle(`🧹 Wiped Users — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

// .restore — restore saved roles (from old wipe system, kept for compatibility)
const restore = {
  name: 'restore',
  category: 'moderation',
  description: 'Restore saved roles to a user',
  usage: '.restore <@user>',
  example: '.restore @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id });
    if (!ud?.savedRoles?.length)
      return message.reply({ embeds: [errorEmbed('No saved roles found for that user.')] });

    const { restored, failed } = await restoreSavedRoles(target, ud.savedRoles, `Restore wipe by ${message.author.tag}`);
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { savedRoles: failed });

    const failedText = failed.length ? ` **${failed.length}** roles could not be restored because of role hierarchy/permissions.` : '';
    return message.reply({ embeds: [successEmbed(`Restored **${restored.length}** roles to ${target}.${failedText}`)] });
  },
};

// .unwipeall — unban everyone + clear wipe list
const unwipeall = {
  name: 'unwipeall',
  category: 'moderation',
  description: 'Unban everyone and reset the wipe list',
  usage: '.unwipeall',
  example: '.unwipeall',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can use this.')] });

    const status = await message.reply({ embeds: [{ color: 0x5865F2, description: '⏳ Unbanning all users...' }] });

    const bans = await message.guild.bans.fetch();
    let count = 0;
    for (const [, ban] of bans) {
      await message.guild.members.unban(ban.user.id, `Unwipeall by ${message.author.tag}`).catch(() => {});
      count++;
      if (count % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    }

    await UserData.updateMany({ guildId: message.guild.id, isWiped: true }, { isWiped: false });
    await logAction(message.guild, { action: 'Unwipe All', moderator: message.author.id, target: null, reason: `Unbanned ${count} users`, color: 0x57F287 });

    return status.edit({ embeds: [successEmbed(`Unbanned **${count}** users and reset the wipe list.`)] });
  },
};

module.exports = [wipe, unwipe, wipelist, restore, unwipeall];
