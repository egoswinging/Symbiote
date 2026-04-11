const { Events } = require('discord.js');

module.exports = {
  name: Events.MessageDelete,
  execute(message, client) {
    if (message.author?.bot) return;
    if (!message.guild) return;

    // Store snipe: last deleted message per channel
    client.snipes.set(message.channel.id, {
      content:   message.content || '*[No text content]*',
      author:    message.author?.tag || 'Unknown',
      authorId:  message.author?.id,
      avatar:    message.author?.displayAvatarURL({ dynamic: true }),
      timestamp: new Date(),
    });
  },
};
