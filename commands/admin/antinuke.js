const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

const TRIGGERS = {
  channeldelete: { key: 'channelDelete', label: 'Channel Delete', defaultLimit: 3, desc: 'Mass channel deletion' },
  channel:       { key: 'channelDelete', label: 'Channel Delete', defaultLimit: 3, desc: 'Mass channel deletion' },
  roledelete:    { key: 'roleDelete',    label: 'Role Delete',    defaultLimit: 3, desc: 'Mass role deletion' },
  role:          { key: 'roleDelete',    label: 'Role Delete',    defaultLimit: 3, desc: 'Mass role deletion' },
  ban:           { key: 'ban',           label: 'Mass Ban',       defaultLimit: 3, desc: 'Mass banning members' },
  massban:       { key: 'ban',           label: 'Mass Ban',       defaultLimit: 3, desc: 'Mass banning members' },
  kick:          { key: 'kick',          label: 'Mass Kick',      defaultLimit: 5, desc: 'Mass kicking members' },
  masskick:      { key: 'kick',          label: 'Mass Kick',      defaultLimit: 5, desc: 'Mass kicking members' },
  spam:          { key: 'spam',          label: 'Message Spam',   defaultLimit: 5, desc: 'Message spam' },
};

const CANONICAL_TRIGGERS = ['channeldelete', 'roledelete', 'ban', 'kick', 'spam'];
const PUNISHMENTS = {
  ban: 'ban',
  kick: 'kick',
  timeout: 'timeout',
  mute: 'timeout',
  to: 'timeout',
  vanish: 'vanish',
  removeroles: 'removeRoles',
  removerole: 'removeRoles',
  remove: 'removeRoles',
  roles: 'removeRoles',
  none: 'none',
  off: 'none',
};

const PUNISHMENT_LABELS = {
  ban: 'Ban',
  kick: 'Kick',
  timeout: 'Timeout',
  vanish: 'Vanish',
  removeRoles: 'Remove Roles',
  none: 'Off',
};

function normalizeTrigger(input) {
  return TRIGGERS[String(input || '').toLowerCase()] || null;
}

function normalizePunishment(input) {
  return PUNISHMENTS[String(input || '').toLowerCase()] || null;
}

function parseLimit(input) {
  if (input === undefined || input === null || input === '') return null;
  const limit = Number.parseInt(input, 10);
  return Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : null;
}

function parseDuration(input) {
  const match = String(input || '').toLowerCase().match(/^(\d+)(m|min|h|hr|d|day)?$/);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2] || 'm';
  const minutes = unit.startsWith('d') ? amount * 1440 : unit.startsWith('h') ? amount * 60 : amount;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 28 * 1440) return null;
  return minutes;
}

function formatMinutes(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function triggerRows(an) {
  return CANONICAL_TRIGGERS.map(name => {
    const trigger = TRIGGERS[name];
    const punishment = an?.punishments?.[trigger.key] || an?.punishment || 'removeRoles';
    const limit = an?.thresholds?.[trigger.key] ?? trigger.defaultLimit;
    const label = PUNISHMENT_LABELS[punishment] || punishment;
    return `**${trigger.label}** - ${trigger.desc}\n> Action: \`${label}\` | Limit: \`${limit}\` in 10s`;
  }).join('\n\n');
}

function helpEmbed(an) {
  return new EmbedBuilder()
    .setColor(an?.enabled ? 0xED4245 : 0x5865F2)
    .setTitle('Anti-Nuke')
    .setDescription([
      `Status: **${an?.enabled ? 'Enabled' : 'Disabled'}**`,
      '',
      '**Main Commands**',
      '`.an on` / `.an off`',
      '`.an config`',
      '`.an set <trigger> <action> [limit]`',
      '`.an limit <trigger> <limit>`',
      '`.an timeout <duration>`',
      '`.an wl add @user` / `.an wl remove @user` / `.an wl list`',
      '',
      '**Triggers**',
      '`channeldelete`, `roledelete`, `ban`, `kick`, `spam`',
      '',
      '**Actions**',
      '`ban`, `kick`, `timeout`, `vanish`, `removeroles`, `none`',
      '',
      '**Examples**',
      '`.an set ban ban 3`',
      '`.an set kick ban 3`',
      '`.an set channeldelete ban 2`',
      '`.an set spam timeout 5`',
    ].join('\n'));
}

module.exports = {
  name: 'antinuke',
  aliases: ['an'],
  category: 'admin',
  description: 'Easy anti-nuke setup with per-trigger actions',
  usage: '.an <on|off|config|set|limit|timeout|wl>',
  example: '.an set ban ban 3\n.an set kick ban 3\n.an config',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config)) {
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage anti-nuke.')] });
    }

    const sub = String(args[0] || 'help').toLowerCase();
    const an = config.antiNuke || {};

    if (['help', 'h', '?'].includes(sub)) {
      return message.reply({ embeds: [helpEmbed(an)] });
    }

    if (['on', 'enable', 'enabled'].includes(sub)) {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': true });
      return message.reply({ embeds: [successEmbed('Anti-nuke **enabled**. Use `.an config` to review settings.')] });
    }

    if (['off', 'disable', 'disabled'].includes(sub)) {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': false });
      return message.reply({ embeds: [successEmbed('Anti-nuke **disabled**.')] });
    }

    if (['config', 'settings', 'show'].includes(sub)) {
      const embed = new EmbedBuilder()
        .setColor(an.enabled ? 0xED4245 : 0x2B2D31)
        .setTitle(`Anti-Nuke - ${an.enabled ? 'Enabled' : 'Disabled'}`)
        .setDescription(triggerRows(an))
        .addFields(
          { name: 'Timeout Action Duration', value: `\`${formatMinutes(an.timeoutDuration || 60)}\``, inline: true },
          { name: 'Personal App Blocking', value: an.blockUserApps !== false ? '`On`' : '`Off`', inline: true },
          { name: 'Whitelist', value: an.whitelist?.length ? an.whitelist.map(id => `<@${id}>`).join(', ') : '`None`', inline: false },
        )
        .setFooter({ text: '.an set <trigger> <action> [limit]' });
      return message.reply({ embeds: [embed] });
    }

    if (['set', 'add', 'action'].includes(sub)) {
      const trigger = normalizeTrigger(args[1]);
      const punishment = normalizePunishment(args[2]);
      const limit = parseLimit(args[3]);

      if (!trigger || !punishment) {
        return message.reply({ embeds: [errorEmbed('Use `.an set <trigger> <action> [limit]`.\nExample: `.an set kick ban 3`')] });
      }
      if (args[3] && !limit) {
        return message.reply({ embeds: [errorEmbed('Limit must be a number from 1 to 50.')] });
      }

      const updates = { [`antiNuke.punishments.${trigger.key}`]: punishment };
      if (limit) updates[`antiNuke.thresholds.${trigger.key}`] = limit;
      await GuildConfig.updateOne({ guildId: message.guild.id }, updates);

      const limitText = limit ? ` after **${limit}** actions in 10s` : '';
      return message.reply({ embeds: [successEmbed(`**${trigger.label}** now uses **${PUNISHMENT_LABELS[punishment]}**${limitText}.`)] });
    }

    if (['limit', 'threshold'].includes(sub)) {
      const trigger = normalizeTrigger(args[1]);
      const limit = parseLimit(args[2]);
      if (!trigger || !limit) {
        return message.reply({ embeds: [errorEmbed('Use `.an limit <trigger> <limit>`.\nExample: `.an limit ban 3`')] });
      }
      await GuildConfig.updateOne({ guildId: message.guild.id }, { [`antiNuke.thresholds.${trigger.key}`]: limit });
      return message.reply({ embeds: [successEmbed(`**${trigger.label}** limit set to **${limit}** actions in 10s.`)] });
    }

    if (['reset', 'remove'].includes(sub)) {
      const trigger = normalizeTrigger(args[1]);
      if (!trigger) return message.reply({ embeds: [errorEmbed('Use `.an reset <trigger>`.')] });
      await GuildConfig.updateOne(
        { guildId: message.guild.id },
        {
          [`antiNuke.punishments.${trigger.key}`]: null,
          [`antiNuke.thresholds.${trigger.key}`]: trigger.defaultLimit,
        }
      );
      return message.reply({ embeds: [successEmbed(`**${trigger.label}** reset to default.`)] });
    }

    if (sub === 'timeout') {
      const minutes = parseDuration(args[1]);
      if (!minutes) {
        return message.reply({ embeds: [errorEmbed('Use `.an timeout <duration>` like `.an timeout 30m`, `.an timeout 2h`, or `.an timeout 7d`. Max is 28d.')] });
      }
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.timeoutDuration': minutes });
      return message.reply({ embeds: [successEmbed(`Anti-nuke timeout action duration set to **${formatMinutes(minutes)}**.`)] });
    }

    if (['wl', 'whitelist'].includes(sub)) {
      const action = String(args[1] || '').toLowerCase();
      if (action === 'list') {
        const list = an.whitelist || [];
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Anti-Nuke Whitelist')
          .setDescription(list.length ? list.map(id => `<@${id}> (${id})`).join('\n') : '`Nobody whitelisted`')]
        });
      }

      const target = await resolveMember(message.guild, args[2]);
      if (!target) return message.reply({ embeds: [errorEmbed('Use `.an wl add @user`, `.an wl remove @user`, or `.an wl list`.')] });

      const list = [...new Set((an.whitelist || []).map(String))];
      if (action === 'add') {
        if (!list.includes(target.id)) list.push(target.id);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': list });
        return message.reply({ embeds: [successEmbed(`${target} added to anti-nuke whitelist.`)] });
      }
      if (action === 'remove') {
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': list.filter(id => id !== target.id) });
        return message.reply({ embeds: [successEmbed(`${target} removed from anti-nuke whitelist.`)] });
      }
      return message.reply({ embeds: [errorEmbed('Use `.an wl add @user`, `.an wl remove @user`, or `.an wl list`.')] });
    }

    if (['apps', 'blockapps', 'blockuserapps'].includes(sub)) {
      const value = String(args[1] || '').toLowerCase();
      const enabled = ['on', 'enable', 'enabled', 'true', 'yes'].includes(value);
      const disabled = ['off', 'disable', 'disabled', 'false', 'no'].includes(value);
      if (!enabled && !disabled) return message.reply({ embeds: [errorEmbed('Use `.an apps on` or `.an apps off`.')] });
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.blockUserApps': enabled });
      return message.reply({ embeds: [successEmbed(`Personal app blocking is now **${enabled ? 'on' : 'off'}**.`)] });
    }

    return message.reply({ embeds: [helpEmbed(an)] });
  },
};
