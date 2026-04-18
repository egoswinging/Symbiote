const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendDeleteEditLog } = require('../utils/logger');

const BOT_DELETED = new Set();

function markBotDeleted(messageId) {
  BOT_DELETED.add(messageId);
  setTimeout(() => BOT_DELETED.delete(messageId), 5000);
}

module.exports = {
  name: Events.MessageDelete,
  execute(message, client) {
    if (!message.guild) return;
    if (message.author?.bot) return;

    // Store snipe
    if (message.author) {
      client.snipes.set(message.channel.id, {
        content:   message.content || '*[No text content]*',
        author:    message.author?.tag || 'Unknown',
        authorId:  message.author?.id,
        avatar:    message.author?.displayAvatarURL({ dynamic: true }),
        timestamp: new Date(),
      });
    }

    // Skip if bot deleted it (clean, shush, .c, automod)
    if (BOT_DELETED.has(message.id)) return;
    if (!message.content && message.attachments.size === 0) return;

    (async () => {
      await new Promise(r => setTimeout(r, 1000));

      let deletedBy = null;
      try {
        const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 1 });
        const entry = logs.entries.first();
        if (entry && Date.now() - entry.createdTimestamp < 5000 && entry.target?.id === message.author?.id) {
          deletedBy = entry.executor;
          if (deletedBy?.id === message.guild.client.user.id) return;
        }
      } catch {}

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🗑️ Message Deleted')
        .addFields(
          { name: 'Author',     value: message.author ? `<@${message.author.id}> (${message.author.tag})` : 'Unknown', inline: true },
          { name: 'Channel',    value: `<#${message.channel.id}>`, inline: true },
          { name: 'Deleted By', value: deletedBy ? `<@${deletedBy.id}> (${deletedBy.tag})` : 'Author or unknown', inline: true },
          { name: 'Content',    value: (message.content || '*[No text content]*').slice(0, 1000), inline: false },
        )
        .setFooter({ text: `Message ID: ${message.id}` })
        .setTimestamp();

      if (message.attachments.size > 0) {
        embed.addFields({
          name: 'Attachments',
          value: message.attachments.map(a => a.url).join('\n').slice(0, 500),
          inline: false,
        });
      }

      // Goes to dele-edit channel
      await sendDeleteEditLog(message.guild, embed);
    })();
  },
};

module.exports.markBotDeleted = markBotDeleted;
