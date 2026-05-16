const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { getPermTier, tierRank } = require('../../utils/permissions');
const UserData = require('../../models/UserData');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

// .innercircle — GIVE: bot owner only
const innercircle = {
  name: 'innercircle', category: 'owner',
  description: 'Grant inner circle access (bot owner only)',
  usage: '.innercircle @user', example: '.innercircle @John',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can grant inner circle.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isInnerCircle: true }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} added to the **inner circle**.`)] });
  },
};

// .innercirclelist — inner circle AND above can view
const innercirclelist = {
  name: 'innercirclelist', category: 'owner',
  description: 'Show all inner circle members (inner circle+ can view)',
  usage: '.innercirclelist', example: '.innercirclelist',
  async execute(message, args, client, config) {
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    const tier = await getPermTier(message.member, config);
    const canView = isBotOwner(message.author.id) || tier === 'close' || ud?.isInnerCircle;
    if (!canView)
      return message.reply({ embeds: [errorEmbed('Only **inner circle** or higher can view this.')] });
    const list = await UserData.find({ guildId: message.guild.id, isInnerCircle: true });
    if (!list.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No inner circle members.')] });
    const lines = list.map((u, i) => {
      const isClose = (config.closeWhitelist || []).includes(u.userId);
      return `\`${i + 1}.\` <@${u.userId}> (${u.userId})${isClose ? ' 🔒 *close*' : ''}`;
    });
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle(`👑 Inner Circle — ${list.length} members`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: '🔒 = also in close whitelist' })]
    });
  },
};

// .removeinnercircle — REMOVE: better(✗), close, bot owner
const removeinnercircle = {
  name: 'removeinnercircle', aliases: ['ric'], category: 'owner',
  description: 'Remove a user from inner circle (✗/close/bot owner only)',
  usage: '.removeinnercircle @user', example: '.removeinnercircle @John',
  async execute(message, args, client, config) {
    const tier = await getPermTier(message.member, config);
    const hasBetterRole = config.betterRoleId && message.member.roles.cache.has(config.betterRoleId);
    const canRemove = isBotOwner(message.author.id) || tier === 'close' || hasBetterRole;
    if (!canRemove)
      return message.reply({ embeds: [errorEmbed('You need **✗ role**, **close**, or **bot owner** to remove inner circle.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if ((config.closeWhitelist || []).includes(target.id) && tier !== 'close' && !isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('You cannot remove a **close** member from inner circle.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isInnerCircle: false });
    return message.reply({ embeds: [successEmbed(`${target} removed from **inner circle**.`)] });
  },
};

module.exports = [innercircle, innercirclelist, removeinnercircle];
