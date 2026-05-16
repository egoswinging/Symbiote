const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

const ACTIONS = {
  channeldelete: { key: 'channelDelete', label: 'Channel Delete', desc: 'Deleting channels rapidly' },
  roledelete:    { key: 'roleDelete',    label: 'Role Delete',    desc: 'Deleting roles rapidly' },
  ban:           { key: 'ban',           label: 'Mass Ban',       desc: 'Banning members rapidly' },
  kick:          { key: 'kick',          label: 'Mass Kick',      desc: 'Kicking members rapidly' },
  spam:          { key: 'spam',          label: 'Message Spam',   desc: 'Spamming messages rapidly' },
};

const PUNISHMENTS = ['ban', 'kick', 'timeout', 'vanish', 'removeroles'];

const PUNISHMENT_DISPLAY = {
  ban:         '🔨 Ban',
  kick:        '👢 Kick',
  timeout:     '⏱️ Timeout',
  vanish:      '👻 Vanish',
  removeroles: '🛑 Remove Roles',
};

// Normalize punishment input
function normalizePunishment(input) {
  const map = {
    ban: 'ban', banned: 'ban',
    kick: 'kick', kicked: 'kick',
    timeout: 'timeout', mute: 'timeout', to: 'timeout',
    vanish: 'vanish',
    removeroles: 'removeRoles', removerole: 'removeRoles', remove: 'removeRoles', roles: 'removeRoles',
  };
  return map[input.toLowerCase()] || null;
}

module.exports = {
  name: 'antinuke',
  aliases: ['an'],
  category: 'admin',
  description: 'Manage the anti-nuke system',
  usage: '.antinuke <enable|disable|config|add|remove|timeout|whitelist>',
  example: '.antinuke add channeldelete ban\n.antinuke add spam timeout\n.antinuke timeout 7d',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage anti-nuke.')] });

    const sub = args[0]?.toLowerCase();
    const an  = config.antiNuke;

    // ── enable ────────────────────────────────────────────────────────────────
    if (sub === 'enable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': true });
      return message.reply({ embeds: [successEmbed('Anti-nuke **enabled**.')] });
    }

    // ── disable ───────────────────────────────────────────────────────────────
    if (sub === 'disable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': false });
      return message.reply({ embeds: [successEmbed('Anti-nuke **disabled**.')] });
    }

    // ── config ────────────────────────────────────────────────────────────────
    if (sub === 'config') {
      const timeoutDuration = an.timeoutDuration || 60;
      const days  = Math.floor(timeoutDuration / 1440);
      const hours = Math.floor((timeoutDuration % 1440) / 60);
      const mins  = timeoutDuration % 60;
      const timeoutStr = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      const rows = Object.entries(ACTIONS).map(([, { key, label, desc }]) => {
        const threshold  = an.thresholds?.[key] ?? '—';
        const punishment = an.punishments?.[key] || an.punishment || 'removeRoles';
        const punDisplay = PUNISHMENT_DISPLAY[punishment.toLowerCase()] || punishment;
        return `**${label}**\n> Limit: \`${threshold}\` per 10s  →  ${punDisplay}\n> *${desc}*`;
      });

      const embed = new EmbedBuilder()
        .setColor(an.enabled ? 0xED4245 : 0x2B2D31)
        .setTitle(`🛡️ Anti-Nuke — ${an.enabled ? '✅ Enabled' : '❌ Disabled'}`)
        .setDescription(rows.join('\n\n'))
        .addFields(
          { name: '⏱️ Timeout Duration', value: `\`${timeoutStr}\``, inline: true },
          { name: '🛡️ Block Personal Apps', value: an.blockUserApps !== false ? '✅ On' : '❌ Off', inline: true },
          {
            name: '✅ Whitelist',
            value: an.whitelist?.length ? an.whitelist.map(id => `<@${id}>`).join(', ') : '`None`',
            inline: false,
          },
        )
        .setFooter({ text: 'Use .antinuke add <action> <punishment> to configure each trigger' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ── add <action> <punishment> [limit] ─────────────────────────────────────
    // Formula: .antinuke add channeldelete ban
    //          .antinuke add spam timeout
    //          .antinuke add kick ban 3       (optional: set limit too)
    if (sub === 'add') {
      const actionInput = args[1]?.toLowerCase();
      const punishInput = args[2]?.toLowerCase();
      const limitInput  = args[3];

      if (!actionInput || !punishInput) {
        const actionList = Object.entries(ACTIONS)
          .map(([alias, { label, desc }]) => `\`${alias}\` — ${label}: ${desc}`)
          .join('\n');
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 .antinuke add — Usage')
            .setDescription(
              '**Formula:** `.antinuke add <action> <punishment> [limit]`\n\n' +
              '**Actions:**\n' + actionList + '\n\n' +
              '**Punishments:** `ban` `kick` `timeout` `vanish` `removeroles`\n\n' +
              '**[limit]** — optional, how many actions in 10s before punishment fires\n\n' +
              '**Examples:**\n' +
              '`.antinuke add channeldelete ban` — ban if channels deleted rapidly\n' +
              '`.antinuke add spam timeout` — timeout spammers\n' +
              '`.antinuke add kick ban 3` — ban if 3 kicks in 10s'
            )]
        });
      }

      const action = ACTIONS[actionInput];
      if (!action)
        return message.reply({ embeds: [errorEmbed(`Unknown action \`${actionInput}\`.\n\nValid actions: ${Object.keys(ACTIONS).map(a => `\`${a}\``).join(', ')}`)] });

      const punishment = normalizePunishment(punishInput);
      if (!punishment)
        return message.reply({ embeds: [errorEmbed(`Unknown punishment \`${punishInput}\`.\n\nValid: \`ban\` \`kick\` \`timeout\` \`vanish\` \`removeroles\``)] });

      const updates = { [`antiNuke.punishments.${action.key}`]: punishment };

      if (limitInput) {
        const limit = parseInt(limitInput);
        if (isNaN(limit) || limit < 1)
          return message.reply({ embeds: [errorEmbed('Limit must be a positive number (e.g. `3`).')] });
        updates[`antiNuke.thresholds.${action.key}`] = limit;
      }

      await GuildConfig.updateOne({ guildId: message.guild.id }, updates);

      const punDisplay = PUNISHMENT_DISPLAY[punishment.toLowerCase()] || punishment;
      const limitText  = limitInput ? ` (triggers after \`${limitInput}\` actions in 10s)` : '';

      return message.reply({
        embeds: [successEmbed(
          `✅ **${action.label}** → ${punDisplay}${limitText}\n\n` +
          `Use \`.antinuke config\` to see all your settings.`
        )]
      });
    }

    // ── remove <action> — reset a trigger back to default ─────────────────────
    if (sub === 'remove') {
      const actionInput = args[1]?.toLowerCase();
      const action = ACTIONS[actionInput];
      if (!action)
        return message.reply({ embeds: [errorEmbed(`Unknown action \`${actionInput}\`.\n\nValid: ${Object.keys(ACTIONS).map(a => `\`${a}\``).join(', ')}`)] });

      await GuildConfig.updateOne(
        { guildId: message.guild.id },
        {
          [`antiNuke.punishments.${action.key}`]: null,
          [`antiNuke.thresholds.${action.key}`]: 3,
        }
      );

      return message.reply({ embeds: [successEmbed(`Reset **${action.label}** back to default settings.`)] });
    }

    // ── timeout <duration> — set how long timeouts last ───────────────────────
    // Accepts: 30m, 2h, 1d, 7d, etc
    if (sub === 'timeout') {
      const input = args[1]?.toLowerCase();
      if (!input)
        return message.reply({ embeds: [errorEmbed('Provide a duration.\n**Examples:** `.antinuke timeout 30m` `.antinuke timeout 2h` `.antinuke timeout 7d`\n\nMax is **28 days** (Discord limit).')] });

      let totalMinutes = 0;
      const match = input.match(/^(\d+)(m|h|d)$/);
      if (!match)
        return message.reply({ embeds: [errorEmbed('Invalid format. Use: `30m` (minutes), `2h` (hours), `7d` (days).')] });

      const value = parseInt(match[1]);
      const unit  = match[2];

      if (unit === 'm') totalMinutes = value;
      if (unit === 'h') totalMinutes = value * 60;
      if (unit === 'd') totalMinutes = value * 1440;

      // Discord max timeout is 28 days
      const maxMinutes = 28 * 24 * 60;
      if (totalMinutes > maxMinutes)
        return message.reply({ embeds: [errorEmbed('Maximum timeout is **28 days** (Discord limit).')] });
      if (totalMinutes < 1)
        return message.reply({ embeds: [errorEmbed('Minimum timeout is 1 minute.')] });

      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.timeoutDuration': totalMinutes });

      const displayStr = unit === 'd' ? `${value} day${value !== 1 ? 's' : ''}` :
                         unit === 'h' ? `${value} hour${value !== 1 ? 's' : ''}` :
                         `${value} minute${value !== 1 ? 's' : ''}`;

      return message.reply({ embeds: [successEmbed(`Timeout duration set to **${displayStr}**.\nThis applies whenever \`timeout\` is used as a punishment.`)] });
    }

    // ── whitelist add/remove/list ─────────────────────────────────────────────
    if (sub === 'whitelist') {
      const action = args[1]?.toLowerCase();

      if (action === 'list') {
        const list = an.whitelist || [];
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('✅ Anti-Nuke Whitelist')
            .setDescription(list.length ? list.map(id => `<@${id}>`).join('\n') : '`Nobody whitelisted`')
            .setFooter({ text: 'Whitelisted users bypass ALL anti-nuke triggers' })]
        });
      }

      const target = await resolveMember(message.guild, args[2]);
      if (!target)
        return message.reply({ embeds: [errorEmbed('Member not found.\n**Usage:** `.antinuke whitelist <add|remove|list> [@user]`')] });

      if (action === 'add') {
        if (an.whitelist?.includes(target.id))
          return message.reply({ embeds: [errorEmbed('User is already whitelisted.')] });
        an.whitelist = an.whitelist || [];
        an.whitelist.push(target.id);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': an.whitelist });
        return message.reply({ embeds: [successEmbed(`${target} added to anti-nuke whitelist.`)] });
      }

      if (action === 'remove') {
        const idx = (an.whitelist || []).indexOf(target.id);
        if (idx === -1) return message.reply({ embeds: [errorEmbed('That user is not whitelisted.')] });
        an.whitelist.splice(idx, 1);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': an.whitelist });
        return message.reply({ embeds: [successEmbed(`${target} removed from anti-nuke whitelist.`)] });
      }

      return message.reply({ embeds: [errorEmbed('Usage: `.antinuke whitelist <add|remove|list> [@user]`')] });
    }

    // ── blockuserapps on/off ──────────────────────────────────────────────────
    if (sub === 'blockuserapps') {
      const val = args[1]?.toLowerCase();
      const enabled = ['on', 'true', 'enable', 'yes'].includes(val);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.blockUserApps': enabled });
      return message.reply({ embeds: [successEmbed(`Personal app blocking **${enabled ? 'enabled' : 'disabled'}**.`)] });
    }

    // ── default help ──────────────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🛡️ Anti-Nuke — Commands')
      .addFields(
        {
          name: '⚡ Toggle',
          value: '`.antinuke enable` — turn on\n`.antinuke disable` — turn off\n`.antinuke config` — view all settings',
          inline: false,
        },
        {
          name: '➕ Add a trigger (main command)',
          value: [
            '**Formula:** `.antinuke add <action> <punishment> [limit]`',
            '',
            '**Actions:** `channeldelete` `roledelete` `ban` `kick` `spam`',
            '**Punishments:** `ban` `kick` `timeout` `vanish` `removeroles`',
            '**[limit]** — optional, actions in 10s before punishment (default: 3)',
            '',
            '**Examples:**',
            '`.antinuke add channeldelete ban` — ban if channels deleted rapidly',
            '`.antinuke add spam timeout` — timeout spammers',
            '`.antinuke add kick ban 3` — ban if 3 kicks happen in 10s',
          ].join('\n'),
          inline: false,
        },
        {
          name: '⏱️ Set timeout duration',
          value: '`.antinuke timeout 30m` — 30 minutes\n`.antinuke timeout 2h` — 2 hours\n`.antinuke timeout 7d` — 7 days\n*(Max: 28 days)*',
          inline: false,
        },
        {
          name: '🗑️ Reset a trigger',
          value: '`.antinuke remove <action>` — reset back to defaults',
          inline: false,
        },
        {
          name: '✅ Whitelist',
          value: '`.antinuke whitelist add @user`\n`.antinuke whitelist remove @user`\n`.antinuke whitelist list`',
          inline: false,
        },
        {
          name: '🔒 Block Personal Apps',
          value: '`.antinuke blockuserapps on` — block user-installed bots\n`.antinuke blockuserapps off` — allow them',
          inline: false,
        },
      )
      .setFooter({ text: 'Run .antinuke config to see your current settings' });

    return message.reply({ embeds: [embed] });
  },
};
