const { Events, AuditLogEvent } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');

function ownerIds() {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isBotOwner(id) {
  return ownerIds().includes(id);
}

async function getProtectionLevel(guildId, userId, config) {
  if (isBotOwner(userId)) return 'bot_owner';
  if ((config.closeWhitelist || []).includes(userId)) return 'close';

  const ud = await UserData.findOne({ guildId, userId }).lean();
  if (ud?.isInnerCircle) return 'inner_circle';
  if (ud?.isSecret) return 'st';

  return 'none';
}

const LEVEL_RANK = { bot_owner: 5, close: 4, inner_circle: 3, st: 2, none: 0 };

async function punishUnauthorizedExecutor(guild, executorId, reason) {
  if (!executorId || isBotOwner(executorId) || guild.ownerId === executorId) return;

  const executorMember = await guild.members.fetch(executorId).catch(() => null);
  if (executorMember) {
    await executorMember.kick(reason).catch(() => {});
    return;
  }

  await guild.members.ban(executorId, { reason }).catch(() => {});
}

async function getRecentAuditEntry(guild, type, targetId) {
  await new Promise(r => setTimeout(r, 1000));
  const logs = await guild.fetchAuditLogs({ type, limit: 1 }).catch(() => null);
  const entry = logs?.entries?.first?.();
  if (!entry || Date.now() - entry.createdTimestamp > 5000) return null;
  if (entry.target?.id !== targetId) return null;
  return entry;
}

module.exports.guildMemberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const guild = member.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) return;

    try {
      const entry = await getRecentAuditEntry(guild, AuditLogEvent.MemberKick, member.id);
      if (!entry?.executor) return;

      const executor = entry.executor;
      if (isBotOwner(executor.id) || executor.id === guild.ownerId) return;

      const victimLevel = await getProtectionLevel(guild.id, member.id, config);
      const executorLevel = await getProtectionLevel(guild.id, executor.id, config);

      if (victimLevel === 'bot_owner') {
        await punishUnauthorizedExecutor(guild, executor.id, 'Kicked a protected bot owner');
        return;
      }

      if (victimLevel === 'close' && executorLevel !== 'bot_owner') {
        await punishUnauthorizedExecutor(guild, executor.id, 'Kicked a protected close user');
        return;
      }
    } catch (e) {
      console.error('[actionGuard kick]', e.message);
    }
  },
};

module.exports.guildBanAdd = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    const guild = ban.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) return;

    try {
      const entry = await getRecentAuditEntry(guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      if (!entry?.executor) return;

      const executor = entry.executor;
      if (isBotOwner(executor.id) || executor.id === guild.ownerId) return;

      const victimLevel = await getProtectionLevel(guild.id, ban.user.id, config);
      const executorLevel = await getProtectionLevel(guild.id, executor.id, config);

      if (victimLevel === 'bot_owner') {
        await guild.members.unban(ban.user.id, 'Protected bot owner - ban reversed').catch(() => {});
        await punishUnauthorizedExecutor(guild, executor.id, 'Banned a protected bot owner');
        return;
      }

      if (victimLevel === 'close' && executorLevel !== 'bot_owner') {
        await guild.members.unban(ban.user.id, 'Protected close user - ban reversed').catch(() => {});
        await punishUnauthorizedExecutor(guild, executor.id, 'Banned a protected close user');
        return;
      }
    } catch (e) {
      console.error('[actionGuard ban]', e.message);
    }
  },
};
