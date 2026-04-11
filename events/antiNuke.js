const { Events, AuditLogEvent, EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');
const { trackAction, clearTracker } = require('../utils/antiNukeTracker');
const { sendLog } = require('../utils/logger');

/**
 * Apply anti-nuke punishment to a member.
 */
async function punish(guild, userId, punishment, reason) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  // Never punish bot owner or server owner
  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(userId) || guild.ownerId === userId) return;

  clearTracker(guild.id, userId);

  try {
    switch (punishment) {
      case 'removeRoles': {
        const roles = member.roles.cache.filter(r => r.id !== guild.id);
        await member.roles.remove(roles, `Anti-Nuke: ${reason}`);
        break;
      }
      case 'kick':
        await member.kick(`Anti-Nuke: ${reason}`);
        break;
      case 'ban':
        await guild.members.ban(userId, { reason: `Anti-Nuke: ${reason}` });
        break;
      case 'vanish': {
        const config = await GuildConfig.findOne({ guildId: guild.id });
        const roles = member.roles.cache.filter(r => r.id !== guild.id);
        await member.roles.remove(roles, 'Anti-Nuke vanish');
        if (config?.vanishRole) await member.roles.add(config.vanishRole).catch(() => {});
        break;
      }
    }

    // Log
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🚨 Anti-Nuke Triggered')
      .addFields(
        { name: 'User',       value: `<@${userId}> (${userId})`, inline: true },
        { name: 'Punishment', value: punishment,                  inline: true },
        { name: 'Reason',     value: reason,                      inline: false },
      )
      .setTimestamp();

    await sendLog(guild, embed);
  } catch (err) {
    console.error('Anti-nuke punishment failed:', err.message);
  }
}

/**
 * Generic handler: fetch executor from audit log and track action.
 */
async function handleEvent(guild, auditLogEvent, action) {
  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (!config?.antiNuke?.enabled) return;

  await new Promise(r => setTimeout(r, 1000)); // Wait for audit log propagation

  let entry;
  try {
    const logs = await guild.fetchAuditLogs({ type: auditLogEvent, limit: 1 });
    entry = logs.entries.first();
  } catch { return; }

  if (!entry) return;
  const { executor } = entry;
  if (!executor) return;

  // Skip whitelisted users and bot itself
  if (config.antiNuke.whitelist.includes(executor.id)) return;
  if (executor.id === guild.client.user.id) return;
  if (guild.ownerId === executor.id) return;

  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(executor.id)) return;

  const threshold = config.antiNuke.thresholds[action] || 3;
  const exceeded  = trackAction(guild.id, executor.id, action, threshold);

  if (exceeded) {
    await punish(guild, executor.id, config.antiNuke.punishment, `${action} threshold exceeded`);
  }
}

// ─── EXPORTS: individual event listeners ──────────────────────────────────────

module.exports.channelDelete = {
  name: Events.ChannelDelete,
  execute: (channel, client) => handleEvent(channel.guild, AuditLogEvent.ChannelDelete, 'channelDelete'),
};

module.exports.roleDelete = {
  name: Events.GuildRoleDelete,
  execute: (role, client) => handleEvent(role.guild, AuditLogEvent.RoleDelete, 'roleDelete'),
};

module.exports.guildBanAdd = {
  name: Events.GuildBanAdd,
  execute: (ban, client) => handleEvent(ban.guild, AuditLogEvent.MemberBanAdd, 'ban'),
};

module.exports.guildMemberRemove = {
  name: Events.GuildMemberRemove,
  execute: async (member, client) => {
    // Only track kicks (not voluntary leaves)
    const config = await GuildConfig.findOne({ guildId: member.guild.id });
    if (!config?.antiNuke?.enabled) return;
    await new Promise(r => setTimeout(r, 800));
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
      if (entry.target.id !== member.id) return;
      const { executor } = entry;
      if (!executor || config.antiNuke.whitelist.includes(executor.id)) return;
      if (executor.id === member.guild.client.user.id) return;
      const threshold = config.antiNuke.thresholds.kick || 5;
      const exceeded = trackAction(member.guild.id, executor.id, 'kick', threshold);
      if (exceeded) await punish(member.guild, executor.id, config.antiNuke.punishment, 'kick threshold exceeded');
    } catch {}
  },
};
