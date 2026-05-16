const { Events, AuditLogEvent } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');

// Watches for manual role assignments of ✱ and ✗ roles
// If anyone adds these roles manually (not via bot), instantly removes them
// Also protects .close and .better users from being kicked/banned by inner circle/st

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    const guild = newMember.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) return;

    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());

    // ── Detect manually added ✱ or ✗ roles ───────────────────────────────────
    const trackedRoles = [config.otRoleId, config.betterRoleId].filter(Boolean);
    if (!trackedRoles.length) return;

    const addedRoles = [...newMember.roles.cache.keys()].filter(
      id => !oldMember.roles.cache.has(id) && trackedRoles.includes(id)
    );

    if (addedRoles.length === 0) return;

    // Check audit log to see who added the role
    await new Promise(r => setTimeout(r, 1000));
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 });
      const entry = logs.entries.first();

      if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
      if (entry.target?.id !== newMember.id) return;

      const executor = entry.executor;
      if (!executor) return;

      // If the executor is the bot itself — this was a legit bot action, allow it
      if (executor.id === client.user.id) return;

      // If executor is bot owner — allow
      if (ownerIds.includes(executor.id)) return;

      // Otherwise: someone added the role manually — strip it immediately
      console.log(`[roleGuard] ${executor.tag} manually added protected role to ${newMember.user.tag} — removing`);
      await newMember.roles.remove(addedRoles, 'Unauthorized: protected role cannot be manually assigned').catch(() => {});

      // Warn the executor
      const executorMember = guild.members.cache.get(executor.id);
      if (executorMember) {
        await executorMember.send(
          `⚠️ You attempted to manually assign a protected role (**✱** or **✗**) in **${guild.name}**.\n` +
          `These roles can only be given via bot commands (\`.ot\` / \`.better\`).`
        ).catch(() => {});
      }

    } catch (e) {
      console.error('[roleGuard] audit log error:', e.message);
    }
  },
};
