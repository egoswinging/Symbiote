const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'clean',
  category: 'moderation',
  description: 'Toggle clean mode for this channel (auto-delete all messages)',
  usage: '.clean',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher to toggle clean mode.')] });

    const channelId = message.channel.id;
    const isClean = client.cleanChannels.has(channelId);

    if (isClean) {
      // Disable clean mode
      client.cleanChannels.delete(channelId);
      config.cleanChannels = config.cleanChannels.filter(id => id !== channelId);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { cleanChannels: config.cleanChannels });
      return message.reply({ embeds: [successEmbed(`Clean mode **disabled** in ${message.channel}.`)] });
    } else {
      // Enable clean mode
      client.cleanChannels.add(channelId);
      if (!config.cleanChannels.includes(channelId)) {
        config.cleanChannels.push(channelId);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { cleanChannels: config.cleanChannels });
      }
      const reply = await message.reply({ embeds: [successEmbed(`Clean mode **enabled** in ${message.channel}. All new messages will be deleted.`)] });
      // Delete the confirmation after 5s since clean mode is now on
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
  },
};
