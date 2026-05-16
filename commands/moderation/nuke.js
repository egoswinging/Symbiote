const { requireTier } = require('../../utils/permissions');
const { errorEmbed } = require('../../utils/embeds');
const { logAction } = require('../../utils/logger');

module.exports = {
  name: 'nuke',
  category: 'moderation',
  description: 'Nuke the current channel (clone + delete, sends nothing)',
  usage: '.nuke',
  example: '.nuke',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const channel = message.channel;

    try {
      const newChannel = await channel.clone({ reason: `Nuked by ${message.author.tag}` });
      await newChannel.setPosition(channel.position);
      await channel.delete(`Nuked by ${message.author.tag}`);
      // Sends nothing — as requested
      await logAction(message.guild, { action: 'Channel Nuked', moderator: message.author.id, target: null, reason: `#${channel.name}`, color: 0xED4245 });
    } catch (err) {
      console.error('Nuke failed:', err);
    }
  },
};
