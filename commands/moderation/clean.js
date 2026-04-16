const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'clean',
  category: 'moderation',
  description: 'Toggle auto-delete mode for this channel',
  usage: '.clean',
  example: '.clean',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const channelId = message.channel.id;
    const isClean = client.cleanChannels.has(channelId);

    // Delete the command message immediately
    await message.delete().catch(() => {});

    if (isClean) {
      client.cleanChannels.delete(channelId);
      config.cleanChannels = config.cleanChannels.filter(id => id !== channelId);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { cleanChannels: config.cleanChannels });

      const reply = await message.channel.send({ embeds: [successEmbed(`Clean mode **disabled** in ${message.channel}.`)] });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } else {
      client.cleanChannels.add(channelId);
      if (!config.cleanChannels.includes(channelId)) {
        config.cleanChannels.push(channelId);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { cleanChannels: config.cleanChannels });
      }
      const reply = await message.channel.send({ embeds: [successEmbed(`Clean mode **enabled** in ${message.channel}.`)] });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    }
  },
};
