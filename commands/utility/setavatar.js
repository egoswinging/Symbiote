const { errorEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
  name: 'setavatar',
  aliases: ['sav'],
  category: 'utility',
  description: "Change the bot's avatar — attach an image to the message",
  usage: '.setavatar (attach an image)',
  example: '.setavatar (with image attached)',

  async execute(message, args, client, config) {
    // Bot owner only
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    if (!ownerIds.includes(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can change the avatar.')] });

    // Check for attachment
    const attachment = message.attachments.first();
    if (!attachment)
      return message.reply({ embeds: [errorEmbed('Please attach an image to the message.\ne.g. send `.setavatar` with an image attached.')] });

    // Validate it's an image
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (attachment.contentType && !validTypes.includes(attachment.contentType))
      return message.reply({ embeds: [errorEmbed('Only PNG, JPG, GIF, or WEBP images are supported.')] });

    try {
      await client.user.setAvatar(attachment.url);
      return message.reply({
        embeds: [successEmbed(`Bot avatar updated successfully!`)
          .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))]
      });
    } catch (err) {
      // Discord rate limits avatar changes — once per 10 minutes
      if (err.code === 50035 || err.message?.includes('Too many')) {
        return message.reply({ embeds: [errorEmbed('Avatar change rate limited — Discord only allows this once every **10 minutes**. Try again shortly.')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed to update avatar: ${err.message}`)] });
    }
  },
};
