const { Events, AuditLogEvent } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');

// Protects:
// - .better (✗) users from being kicked/banned by anyone below them
// - .close users from being kicked/banned by anyone below bot owner
// If someone tries to kick/ban a protected user, the attacker gets removed instead

async function getProtectionLevel(guildId, userId, config) {
  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(userId)) return 'bot_owner';
  if ((config.closeWhitelist || []).includes(userId)) return 'close';
  const ud = await UserData.findOne({ guildId, userId }).lean();
  if (ud?.isInnerCircle) return 'inner_circle';
  if (ud?.isSecret) return 'st';
  return 'none';
}

const LEVEL_RANK = { bot_owner: 5, close: 4, inner_circle: 3, st: 2, none: 0 };

module.exports.guildMemberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    const guild = member.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) return;

    await new Promise(r => setTimeout(r, 1000));

    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
      if (entry.target?.id !== member.id) return;

      const executor = entry.executor;
      if (!executor) return;

      const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
      if (ownerIds.includes(executor.id)) return; // bot owner can always kick

      const victimLevel   = await getProtectionLevel(guild.id, member.id, config);
      const executorLevel = await getProtectionLevel(guild.id, executor.id, config);

      // If victim is close — nobody below bot_owner can kick them
      if (victimLevel === 'close' && executorLevel !== 'bot_owner') {
        console.log(`[actionGuard] ${executor.tag} kicked a .close user — removing executor`);
        const executorMember = await guild.members.fetch(executor.id).catch(() => null);
        if (executorMember) {
          await executorMember.kick('Attempted to kick a protected (.close) user').catch(() => {});
        }
        return;
      }

      // If victim is ✗ (better role) — inner_circle and st cannot kick them
      if (config.betterRoleId && member.roles?.cache?.has?.(config.betterRoleId)) {
        if (['inner_circle', 'st'].includes(executorLevel) && LEVEL_RANK[executorLevel] <= LEVEL_RANK[victimLevel]) {
          console.log(`[actionGuard] ${executor.tag} (${executorLevel}) kicked a ✗ user — removing executor`);
          const executorMember = await guild.members.fetch(executor.id).catch(() => null);
          if (executorMember) {
            await executorMember.kick('Attempted to kick a ✗ protected user').catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error('[actionGuard kick]', e.message);
    }
  },
};

module.exports.guildBanAdd = {
  name: Events.GuildBanAdd,
  async execute(ban, client) {
    const guild = ban.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) return;

    await new Promise(r => setTimeout(r, 1000));

    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const entry = logs.entries.first();
      if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
      if (entry.target?.id !== ban.user.id) return;

      const executor = entry.executor;
      if (!executor) return;

      const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(executor.id);
      if (ownerIds) return;

      const victimLevel   = await getProtectionLevel(guild.id, ban.user.id, config);
      const executorLevel = await getProtectionLevel(guild.id, executor.id, config);

      // .close users cannot be banned by anyone below bot_owner
      if (victimLevel === 'close' && executorLevel !== 'bot_owner') {
        console.log(`[actionGuard] ${executor.tag} banned a .close user — unbanning + removing executor`);
        await guild.members.unban(ban.user.id, 'Protected .close user — ban reversed').catch(() => {});
        await guild.members.ban(executor.id, { reason: 'Attempted to ban a protected (.close) user' }).catch(() => {});
        return;
      }

      // ✗ users cannot be banned by inner_circle or st
      const victimUd = await UserData.findOne({ guildId: guild.id, userId: ban.user.id }).lean();
      const hasClose  = (config.closeWhitelist || []).includes(ban.user.id);
      const isBetter  = config.betterRoleId;

      if (isBetter && ['inner_circle', 'st'].includes(executorLevel)) {
        // Check if banned user had ✗ role — we need to check audit history since they're already banned
        // We'll check if they were in betterWhitelist or had betterRoleId
        const wasProtected = victimUd?.isInnerCircle || hasClose;
        if (wasProtected && LEVEL_RANK[executorLevel] < LEVEL_RANK[victimLevel]) {
          console.log(`[actionGuard] ${executor.tag} (${executorLevel}) banned a protected user — reversing`);
          await guild.members.unban(ban.user.id, 'Protected user — ban reversed').catch(() => {});
          const executorMember = await guild.members.fetch(executor.id).catch(() => null);
          if (executorMember) {
            await executorMember.kick('Attempted to ban a protected user').catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error('[actionGuard ban]', e.message);
    }
  },
};
