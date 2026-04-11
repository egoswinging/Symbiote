const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

// .click — permanent ban, reban on rejoin
const click = {
  name: 'click',
  category: 'moderation',
  description: 'Permanently ban a user — they get rebanned automatically if they rejoin',
  usage: '.click <@user|id> [reason]',
  example: '.click @John or .click 123456789012345678',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'inner_circle', config))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can use this command.')] });

    const query = args[0]?.replace(/[<@!>]/g, '');
    if (!query) return message.reply({ embeds: [errorEmbed('Provide a user mention, username, or ID.')] });

    const reason = args.slice(1).join(' ') || 'Clicked';

    // Try to resolve as member first, fall back to raw ID for already-banned users
    let userId = query;
    let userTag = query;

    const member = await resolveMember(message.guild, args[0]);
    if (member) {
      userId = member.id;
      userTag = member.user.tag;
    } else if (!/^\d{17,20}$/.test(query)) {
      return message.reply({ embeds: [errorEmbed('Could not find that user. Provide a valid ID, mention, or username.')] });
    }

    try {
      await message.guild.members.ban(userId, { reason: `[CLICK] ${reason}`, deleteMessageSeconds: 86400 });
    } catch {
      return message.reply({ embeds: [errorEmbed('Failed to ban — check my permissions.')] });
    }

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId },
      { isClicked: true, isWiped: true, $push: { punishments: { type: 'click', reason, moderator: message.author.id } } },
      { upsert: true }
    );

    await logAction(message.guild, { action: 'Click (Perma-Ban)', moderator: message.author.id, target: userId, reason, color: 0xED4245 });
    return message.reply({ embeds: [successEmbed(`**${userTag}** has been **clicked**. They will be automatically rebanned if they rejoin.`)] });
  },
};

// .unclick — remove the perma-ban flag
const unclick = {
  name: 'unclick',
  category: 'moderation',
  description: 'Remove the click (perma-ban) from a user and unban them',
  usage: '.unclick <userID>',
  example: '.unclick 123456789012345678',

  async execute(message, args, client, config) {
    // Only inner circle or bot owner can unclick
    const { getPermTier, tierRank } = require('../../utils/permissions');
    const tier = await getPermTier(message.member, config);
    if (tierRank(tier) < tierRank('inner_circle'))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can unclick users.')] });

    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId || !/^\d{17,20}$/.test(userId))
      return message.reply({ embeds: [errorEmbed('Provide a valid user ID.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId },
      { isClicked: false, isWiped: false }
    );

    await message.guild.members.unban(userId, `Unclicked by ${message.author.tag}`).catch(() => {});

    await logAction(message.guild, { action: 'Unclick', moderator: message.author.id, target: userId, reason: 'Perma-ban removed', color: 0x57F287 });
    return message.reply({ embeds: [successEmbed(`User \`${userId}\` has been **unclicked** and unbanned.`)] });
  },
};

module.exports = [click, unclick];
