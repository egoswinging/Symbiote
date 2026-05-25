const { Events, AuditLogEvent } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

async function getRecentRoleUpdateExecutor(guild, targetId) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return null;
    if (entry.target?.id !== targetId) return null;
    return entry.executor || null;
  } catch (e) {
    console.error('[roleGuard] audit log error:', e.message);
    return null;
  }
}

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    const guild = newMember.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config) return;

    const trackedRoles = [config.otRoleId, config.betterRoleId].filter(Boolean);
    const manuallyAddedTrackedRoles = [...newMember.roles.cache.keys()].filter(
      id => !oldMember.roles.cache.has(id) && trackedRoles.includes(id)
    );

    const protectedOwnerRoleRemoved = Boolean(
      config.ownerRole &&
      oldMember.roles.cache.has(config.ownerRole) &&
      !newMember.roles.cache.has(config.ownerRole) &&
      (isBotOwner(newMember.id) || newMember.id === client.user.id)
    );

    if (!manuallyAddedTrackedRoles.length && !protectedOwnerRoleRemoved) return;

    const executor = await getRecentRoleUpdateExecutor(guild, newMember.id);
    if (!executor) return;

    if (executor.id === client.user.id || isBotOwner(executor.id) || executor.id === guild.ownerId) return;

    if (protectedOwnerRoleRemoved) {
      await newMember.roles.add(config.ownerRole, 'Protected owner/Symbiote role restored').catch(() => {});

      const executorMember = guild.members.cache.get(executor.id);
      if (executorMember) {
        await executorMember.send(
          `Warning: you removed the protected owner/Symbiote role in **${guild.name}**. It was restored automatically.`
        ).catch(() => {});
      }
    }

    if (manuallyAddedTrackedRoles.length) {
      await newMember.roles.remove(manuallyAddedTrackedRoles, 'Unauthorized: protected role cannot be manually assigned').catch(() => {});

      const executorMember = guild.members.cache.get(executor.id);
      if (executorMember) {
        await executorMember.send(
          `Warning: protected roles in **${guild.name}** can only be given with bot commands.`
        ).catch(() => {});
      }
    }
  },
};
