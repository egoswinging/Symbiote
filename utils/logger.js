const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

/**
 * Send to the main mod-log channel
 */
async function sendLog(guild, embed) {
  try {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.logChannel) return;
    const channel = guild.channels.cache.get(config.logChannel);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Log send failed:', err.message);
  }
}

/**
 * Send to the delete/edit channel specifically
 */
async function sendDeleteEditLog(guild, embed) {
  try {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    // Fall back to main log channel if dele-edit not configured
    const channelId = config?.deleteEditChannel || config?.logChannel;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Delete/edit log failed:', err.message);
  }
}

/**
 * Standard mod action log (ban, kick, timeout, vanish etc)
 */
async function logAction(guild, { action, moderator, target, reason, color = 0xEB459E }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📋 ${action}`)
    .addFields(
      { name: 'Moderator', value: moderator ? `<@${moderator}>` : 'System', inline: true },
      { name: 'Target',    value: target    ? `<@${target}>`    : 'N/A',    inline: true },
      { name: 'Reason',    value: reason || 'No reason provided', inline: false },
    )
    .setTimestamp();
  await sendLog(guild, embed);
}

module.exports = { sendLog, sendDeleteEditLog, logAction };
