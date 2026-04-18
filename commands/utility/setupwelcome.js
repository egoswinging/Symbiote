const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');
const { ChannelType } = require('discord.js');

module.exports = {
  name: 'setupwelcome',
  category: 'utility',
  description: 'Set up a welcome/leave channel separate from mod logs',
  usage: '.setupwelcome [#channel]',
  example: '.setupwelcome #welcome\n.setupwelcome (creates one automatically)',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can setup the welcome channel.')] });

    // Use mentioned channel or create a new one
    let welcomeChannel = message.mentions.channels.first();

    if (!welcomeChannel) {
      // Create a new #welcome channel
      welcomeChannel = await message.guild.channels.create({
        name: 'welcome',
        type: ChannelType.GuildText,
        topic: 'Member join and leave messages',
        reason: `Welcome channel setup by ${message.author.tag}`,
      }).catch(() => null);

      if (!welcomeChannel)
        return message.reply({ embeds: [errorEmbed('Failed to create channel. Please mention an existing channel instead.')] });
    }

    await GuildConfig.updateOne(
      { guildId: message.guild.id },
      { welcomeChannel: welcomeChannel.id }
    );

    return message.reply({
      embeds: [successEmbed(
        `Welcome/leave channel set to ${welcomeChannel}.\n` +
        `Members joining and leaving will be announced there.\n\n` +
        `This is **separate** from your mod logs channel.`
      )]
    });
  },
};
