const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/logger');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // embeds updating, ignore

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'Author',  value: `<@${newMessage.author?.id}> (${newMessage.author?.tag})`, inline: true },
        { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
        { name: 'Before',  value: (oldMessage.content || '*empty*').slice(0, 1000), inline: false },
        { name: 'After',   value: (newMessage.content || '*empty*').slice(0, 1000), inline: false },
      )
      .setFooter({ text: `Message ID: ${newMessage.id}` })
      .setTimestamp();

    await sendLog(newMessage.guild, embed);
  },
};
