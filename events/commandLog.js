const { Events, EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

const PREFIX = process.env.PREFIX || '.';

// Log every command used to the log channel
module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args[0]?.toLowerCase();
    if (!commandName) return;

    // Only log if it's a real command
    const command = client.commands.get(commandName);
    if (!command) return;

    try {
      const config = await GuildConfig.findOne({ guildId: message.guild.id });
      if (!config?.logChannel) return;

      const logChannel = message.guild.channels.cache.get(config.logChannel);
      if (!logChannel || logChannel.id === message.channel.id) return;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🤖 Command Used')
        .addFields(
          { name: 'User',    value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Command', value: `\`${message.content.slice(0, 500)}\``, inline: false },
        )
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch {}
  },
};
