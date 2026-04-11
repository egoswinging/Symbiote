const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

function isBotOwner(userId) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(userId);
}

// .innercircle — add user to inner circle (bot owner only)
const innercircle = {
  name: 'innercircle',
  category: 'owner',
  description: 'Grant a user full inner circle access (bot owner only)',
  usage: '.innercircle <@user>',
  example: '.innercircle @John',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can manage the inner circle.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isInnerCircle: true },
      { upsert: true }
    );

    return message.reply({ embeds: [successEmbed(`${target} has been added to the **inner circle**. They have full bot control.`)] });
  },
};

// .innercirclelist — show all inner circle members
const innercirclelist = {
  name: 'innercirclelist',
  category: 'owner',
  description: 'Show all inner circle members',
  usage: '.innercirclelist',
  example: '.innercirclelist',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can view the inner circle.')] });

    const list = await UserData.find({ guildId: message.guild.id, isInnerCircle: true });
    if (!list.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No inner circle members.')] });

    const lines = list.map((u, i) => `\`${i + 1}.\` <@${u.userId}> (${u.userId})`);
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle(`👑 Inner Circle — ${list.length} members`)
        .setDescription(lines.join('\n'))]
    });
  },
};

// Remove from inner circle
const removeinnercircle = {
  name: 'removeinnercircle',
  aliases: ['ric'],
  category: 'owner',
  description: 'Remove a user from the inner circle',
  usage: '.removeinnercircle <@user>',
  example: '.removeinnercircle @John',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can manage the inner circle.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isInnerCircle: false }
    );

    return message.reply({ embeds: [successEmbed(`${target} removed from the **inner circle**.`)] });
  },
};

module.exports = [innercircle, innercirclelist, removeinnercircle];
