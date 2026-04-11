const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

/**
 * Send a log embed to the guild's configured log channel.
 * @param {import('discord.js').Guild} guild
 * @param {EmbedBuilder} embed
 */
async function sendLog(guild, embed) {
  try {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.logChannel) return;

    const channel = guild.channels.cache.get(config.logChannel);
    if (!channel) return;

    await channel.send({ embeds: [embed] });
  } catch (err) {
    // Silent fail — logging should never crash the bot
    console.error('Log send failed:', err.message);
  }
}

/**
 * Build and send a standard mod-action log.
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
