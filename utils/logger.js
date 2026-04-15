const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

/**
 * Send a log embed to the guild's configured log channel.
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

module.exports = { sendLog, logAction };
