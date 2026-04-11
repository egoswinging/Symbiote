const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');
const { ChannelType } = require('discord.js');

module.exports = {
  name: 'setuplogger',
  category: 'utility',
  description: 'Create and setup the logging channel',
  usage: '.setuplogger',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can setup logging.')] });

    // Create a new channel or use existing
    let logChannel = config.logChannel
      ? message.guild.channels.cache.get(config.logChannel)
      : null;

    if (!logChannel) {
      logChannel = await message.guild.channels.create({
        name: 'mod-logs',
        type: ChannelType.GuildText,
        topic: 'Bot moderation logs',
        permissionOverwrites: [
          { id: message.guild.id, deny: ['ViewChannel'] },
          { id: client.user.id,  allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
        ],
        reason: `Logger setup by ${message.author.tag}`,
      });
    }

    await GuildConfig.updateOne({ guildId: message.guild.id }, { logChannel: logChannel.id });

    return message.reply({ embeds: [successEmbed(`Logger set to ${logChannel}. All mod actions will be logged there.`)] });
  },
};
