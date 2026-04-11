const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

// .shush — auto-delete all future messages from user until .unshush
const shush = {
  name: 'shush',
  category: 'moderation',
  description: 'Silently delete all messages from a user until unshushed',
  usage: '.shush <@user>',
  example: '.shush @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot target someone with equal or higher permissions.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isShushed: true },
      { upsert: true }
    );

    await logAction(message.guild, { action: 'Shush', moderator: message.author.id, target: target.id, reason: 'User shushed — messages will be auto-deleted' });
    return message.reply({ embeds: [successEmbed(`${target} has been **shushed**. All their messages will be deleted automatically.`)] });
  },
};

// .unshush — stop deleting their messages
const unshush = {
  name: 'unshush',
  category: 'moderation',
  description: 'Stop auto-deleting messages from a shushed user',
  usage: '.unshush <@user>',
  example: '.unshush @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isShushed: false }
    );

    return message.reply({ embeds: [successEmbed(`${target} has been **unshushed**.`)] });
  },
};

module.exports = [shush, unshush];
