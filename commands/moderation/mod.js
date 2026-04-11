const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

// .kick
const kick = {
  name: 'kick',
  category: 'moderation',
  description: 'Kick a member from the server',
  usage: '.kick <@user> [reason]',
  example: '.kick @John spamming',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('Cannot target someone with equal or higher permissions.')] });
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try { await target.kick(reason); } catch { return message.reply({ embeds: [errorEmbed('Failed to kick.')] }); }
    await logAction(message.guild, { action: 'Kick', moderator: message.author.id, target: target.id, reason });
    return message.reply({ embeds: [successEmbed(`**${target.user.tag}** kicked.\n**Reason:** ${reason}`)] });
  },
};

// .timeout / .mute
const timeout = {
  name: 'timeout',
  aliases: ['mute', 'to'],
  category: 'moderation',
  description: 'Timeout a member for X minutes',
  usage: '.timeout <@user> <minutes> [reason]',
  example: '.timeout @John 30 spamming',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('You need **v3** or higher.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('Cannot target someone with equal or higher permissions.')] });
    const minutes = parseInt(args[1]);
    if (isNaN(minutes) || minutes < 1)
      return message.reply({ embeds: [errorEmbed('Provide a valid duration in minutes.')] });
    const reason = args.slice(2).join(' ') || 'No reason provided';
    const ms = Math.min(minutes * 60 * 1000, 28 * 24 * 60 * 60 * 1000);
    try { await target.timeout(ms, reason); } catch { return message.reply({ embeds: [errorEmbed('Failed to timeout.')] }); }
    await logAction(message.guild, { action: `Timeout (${minutes}m)`, moderator: message.author.id, target: target.id, reason });
    return message.reply({ embeds: [successEmbed(`**${target.user.tag}** timed out for **${minutes}min**.\n**Reason:** ${reason}`)] });
  },
};

// .modlogs
const modlogs = {
  name: 'modlogs',
  category: 'moderation',
  description: 'Show recent moderation actions for a user',
  usage: '.modlogs <@user>',
  example: '.modlogs @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: target.id });
    if (!ud?.punishments?.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription(`No mod logs for **${target.user.tag}**.`)] });
    const recent = ud.punishments.slice(-10).reverse();
    const lines = recent.map((p, i) => {
      const date = new Date(p.timestamp).toLocaleDateString();
      return `\`${i + 1}.\` **${p.type}** — ${p.reason} \`${date}\``;
    });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xEB459E).setTitle(`📋 Mod Logs — ${target.user.tag}`).setDescription(lines.join('\n')).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))] });
  },
};

module.exports = [kick, timeout, modlogs];
