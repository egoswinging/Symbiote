const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

const blacklist = {
  name: 'blacklist',
  category: 'moderation',
  description: 'Blacklist a user from using the bot',
  usage: '.blacklist <@user>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id });
    if (ud?.isBlacklisted)
      return message.reply({ embeds: [errorEmbed('That user is already blacklisted.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isBlacklisted: true },
      { upsert: true }
    );

    return message.reply({ embeds: [successEmbed(`${target} has been **blacklisted** from using the bot.`)] });
  },
};

const bllist = {
  name: 'bllist',
  category: 'moderation',
  description: 'Show all blacklisted users',
  usage: '.bllist',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const list = await UserData.find({ guildId: message.guild.id, isBlacklisted: true });
    if (!list.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No blacklisted users.')] });

    const lines = list.map((ud, i) => `\`${i + 1}.\` <@${ud.userId}> (${ud.userId})`);
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle(`🚫 Blacklisted Users — ${list.length}`)
      .setDescription(lines.join('\n'));

    return message.reply({ embeds: [embed] });
  },
};

module.exports = [blacklist, bllist];
