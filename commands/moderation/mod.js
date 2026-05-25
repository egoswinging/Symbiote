const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

function parseDuration(input) {
  if (!input) return null;

  const raw = input.toLowerCase().trim();
  const match = raw.match(/^(\d+)(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2] || 'm';
  const multipliers = {
    m: 1,
    min: 1,
    mins: 1,
    minute: 1,
    minutes: 1,
    h: 60,
    hr: 60,
    hrs: 60,
    hour: 60,
    hours: 60,
    d: 1440,
    day: 1440,
    days: 1440,
  };

  const minutes = amount * multipliers[unit];
  if (!Number.isFinite(minutes) || minutes < 1) return null;
  return Math.min(minutes, 28 * 24 * 60);
}

function formatDuration(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

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
  description: 'Timeout a member for a specific duration',
  usage: '.timeout <@user> <duration> [reason]',
  example: '.timeout @John 30m spamming\n.timeout @John 2h spam',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('You need **v3** or higher.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('Cannot target someone with equal or higher permissions.')] });

    const minutes = parseDuration(args[1]);
    if (!minutes) {
      return message.reply({ embeds: [errorEmbed(
        'Provide a valid manual timeout duration.\n' +
        '**Examples:** `.timeout @user 30m`, `.timeout @user 2h`, `.timeout @user 1d`\n\n' +
        'This is separate from `.antinuke timeout`.'
      )] });
    }

    const reason = args.slice(2).join(' ') || 'No reason provided';
    const durationLabel = formatDuration(minutes);
    try { await target.timeout(minutes * 60 * 1000, reason); } catch { return message.reply({ embeds: [errorEmbed('Failed to timeout.')] }); }
    await logAction(message.guild, { action: `Timeout (${durationLabel})`, moderator: message.author.id, target: target.id, reason });
    return message.reply({ embeds: [successEmbed(`**${target.user.tag}** timed out for **${durationLabel}**.\n**Reason:** ${reason}`)] });
  },
};

// .untimeout / .unmute
const untimeout = {
  name: 'untimeout',
  aliases: ['unmute', 'uto'],
  category: 'moderation',
  description: 'Remove a timeout from a member',
  usage: '.untimeout <@user> [reason]',
  example: '.untimeout @John appealed',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('You need **v3** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('Cannot target someone with equal or higher permissions.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await target.timeout(null, reason);
    } catch {
      return message.reply({ embeds: [errorEmbed('Failed to remove timeout.')] });
    }

    await logAction(message.guild, { action: 'Timeout Removed', moderator: message.author.id, target: target.id, reason, color: 0x57F287 });
    return message.reply({ embeds: [successEmbed(`Timeout removed from **${target.user.tag}**.\n**Reason:** ${reason}`)] });
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
      return `\`${i + 1}.\` **${p.type}** - ${p.reason} \`${date}\``;
    });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xEB459E).setTitle(`Mod Logs - ${target.user.tag}`).setDescription(lines.join('\n')).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))] });
  },
};

module.exports = [kick, timeout, untimeout, modlogs];
