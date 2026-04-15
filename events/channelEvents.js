const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/logger');

// Helper to get executor from audit log
async function getExecutor(guild, auditType, targetId = null) {
  await new Promise(r => setTimeout(r, 800));
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return null;
    if (targetId && entry.target?.id !== targetId) return null;
    return entry.executor;
  } catch {
    return null;
  }
}

// Channel created
module.exports.channelCreate = {
  name: Events.ChannelCreate,
  async execute(channel, client) {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📢 Channel Created')
      .addFields(
        { name: 'Channel',    value: `<#${channel.id}> (${channel.name})`, inline: true },
        { name: 'Type',       value: `\`${channel.type}\``,                inline: true },
        { name: 'Created By', value: executor ? `<@${executor.id}> (${executor.tag})` : 'Unknown', inline: true },
      )
      .setTimestamp();
    await sendLog(channel.guild, embed);
  },
};

// Channel deleted
module.exports.channelDelete = {
  name: Events.ChannelDelete,
  async execute(channel, client) {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelDelete);
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗑️ Channel Deleted')
      .addFields(
        { name: 'Channel',    value: `#${channel.name}`,                                    inline: true },
        { name: 'Type',       value: `\`${channel.type}\``,                                  inline: true },
        { name: 'Deleted By', value: executor ? `<@${executor.id}> (${executor.tag})` : 'Unknown', inline: true },
      )
      .setTimestamp();
    await sendLog(channel.guild, embed);
  },
};

// Channel updated
module.exports.channelUpdate = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    const changes = [];
    if (oldChannel.name !== newChannel.name)
      changes.push(`**Name:** \`${oldChannel.name}\` → \`${newChannel.name}\``);
    if (oldChannel.topic !== newChannel.topic)
      changes.push(`**Topic:** \`${oldChannel.topic || 'none'}\` → \`${newChannel.topic || 'none'}\``);
    if (oldChannel.nsfw !== newChannel.nsfw)
      changes.push(`**NSFW:** \`${oldChannel.nsfw}\` → \`${newChannel.nsfw}\``);
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser)
      changes.push(`**Slowmode:** \`${oldChannel.rateLimitPerUser}s\` → \`${newChannel.rateLimitPerUser}s\``);

    if (!changes.length) return; // no relevant changes

    const executor = await getExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('✏️ Channel Updated')
      .addFields(
        { name: 'Channel',    value: `<#${newChannel.id}>`, inline: true },
        { name: 'Updated By', value: executor ? `<@${executor.id}> (${executor.tag})` : 'Unknown', inline: true },
        { name: 'Changes',    value: changes.join('\n'), inline: false },
      )
      .setTimestamp();
    await sendLog(newChannel.guild, embed);
  },
};
