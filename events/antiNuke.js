const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');
const { trackAction, clearTracker } = require('../utils/antiNukeTracker');
const { sendLog } = require('../utils/logger');

function getPunishment(config, trigger) {
  return config.antiNuke.punishments?.[trigger] || config.antiNuke.punishment || 'removeRoles';
}

function getTimeoutMinutes(config, trigger) {
  return config?.antiNuke?.timeoutDurations?.[trigger] || config?.antiNuke?.timeoutDuration || 60;
}

async function punish(guild, userId, punishment, reason, config = null, trigger = null) {
  if (!punishment || punishment === 'none') return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(userId) || guild.ownerId === userId) return;

  const ud = await UserData.findOne({ guildId: guild.id, userId }).lean();
  if (ud?.isInnerCircle) return;

  clearTracker(guild.id, userId);

  if (!config) config = await GuildConfig.findOne({ guildId: guild.id });
  const timeoutMins = getTimeoutMinutes(config, trigger);

  try {
    switch (punishment) {
      case 'removeRoles': {
        const roles = member.roles.cache.filter(r => r.id !== guild.id && !r.managed);
        await member.roles.remove(roles, `Anti-Nuke: ${reason}`);
        break;
      }
      case 'kick':
        await member.kick(`Anti-Nuke: ${reason}`);
        break;
      case 'ban':
        await guild.members.ban(userId, { reason: `Anti-Nuke: ${reason}` });
        break;
      case 'timeout':
        await member.timeout(timeoutMins * 60 * 1000, `Anti-Nuke: ${reason}`);
        break;
      case 'vanish': {
        const cfg = config || await GuildConfig.findOne({ guildId: guild.id });
        const roles = member.roles.cache.filter(r => r.id !== guild.id && !r.managed);
        await member.roles.remove(roles, 'Anti-Nuke vanish');
        if (cfg?.vanishRole) await member.roles.add(cfg.vanishRole).catch(() => {});
        break;
      }
      case 'none':
        return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🚨 Anti-Nuke Triggered')
      .addFields(
        { name: 'User',       value: `<@${userId}> (${userId})`, inline: true },
        { name: 'Punishment', value: `\`${punishment}${punishment === 'timeout' ? ` (${timeoutMins}min)` : ''}\``, inline: true },
        { name: 'Reason',     value: reason, inline: false },
      )
      .setTimestamp();

    await sendLog(guild, embed);
  } catch (err) {
    console.error('Anti-nuke punishment failed:', err.message);
  }
}

async function handleEvent(guild, auditLogEvent, trigger) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (!config?.antiNuke?.enabled) return;

  await new Promise(r => setTimeout(r, 1000));

  let entry;
  try {
    const logs = await guild.fetchAuditLogs({ type: auditLogEvent, limit: 1 });
    entry = logs.entries.first();
  } catch { return; }

  if (!entry) return;
  const { executor } = entry;
  if (!executor) return;

  if (config.antiNuke.whitelist?.includes(executor.id)) return;
  if (executor.id === guild.client.user.id) return;
  if (guild.ownerId === executor.id) return;

  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(executor.id)) return;

  const ud = await UserData.findOne({ guildId: guild.id, userId: executor.id }).lean();
  if (ud?.isInnerCircle) return;

  const threshold = config.antiNuke.thresholds?.[trigger] ?? 3;
  if (!threshold) return;
  const exceeded  = trackAction(guild.id, executor.id, trigger, threshold);

  if (exceeded) {
    const punishment = getPunishment(config, trigger);
    await punish(guild, executor.id, punishment, `${trigger} threshold exceeded (${threshold} in 10s)`, config, trigger);
  }
}

module.exports.channelDelete = {
  name: Events.ChannelDelete,
  execute: (channel) => handleEvent(channel.guild, AuditLogEvent.ChannelDelete, 'channelDelete'),
};

module.exports.roleDelete = {
  name: Events.GuildRoleDelete,
  execute: (role) => handleEvent(role.guild, AuditLogEvent.RoleDelete, 'roleDelete'),
};

module.exports.guildBanAdd = {
  name: Events.GuildBanAdd,
  execute: (ban) => handleEvent(ban.guild, AuditLogEvent.MemberBanAdd, 'ban'),
};

module.exports.guildMemberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const config = await GuildConfig.findOne({ guildId: member.guild.id });
    if (!config?.antiNuke?.enabled) return;
    await new Promise(r => setTimeout(r, 800));
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
      if (entry.target.id !== member.id) return;
      const { executor } = entry;
      if (!executor || config.antiNuke.whitelist?.includes(executor.id)) return;
      if (executor.id === member.guild.client.user.id) return;
      if (member.guild.ownerId === executor.id) return;
      const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
      if (ownerIds.includes(executor.id)) return;
      const ud = await UserData.findOne({ guildId: member.guild.id, userId: executor.id }).lean();
      if (ud?.isInnerCircle) return;
      const threshold = config.antiNuke.thresholds?.kick ?? 5;
      if (!threshold) return;
      const exceeded  = trackAction(member.guild.id, executor.id, 'kick', threshold);
      if (exceeded) {
        const punishment = getPunishment(config, 'kick');
        await punish(member.guild, executor.id, punishment, `kick threshold exceeded`, config, 'kick');
      }
    } catch {}
  },
};

module.exports.spamDetect = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot) return;
    const config = await GuildConfig.findOne({ guildId: message.guild.id });
    if (!config?.antiNuke?.enabled) return;
    const spamThreshold = config.antiNuke.thresholds?.spam;
    if (!spamThreshold) return;
    if (config.antiNuke.whitelist?.includes(message.author.id)) return;
    if (message.guild.ownerId === message.author.id) return;
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    if (ownerIds.includes(message.author.id)) return;
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    if (ud?.isInnerCircle) return;
    const exceeded = trackAction(message.guild.id, message.author.id, 'spam', spamThreshold);
    if (exceeded) {
      const punishment = getPunishment(config, 'spam');
      await punish(message.guild, message.author.id, punishment, `spam threshold exceeded`, config, 'spam');
    }
  },
};
