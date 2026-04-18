const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

// All valid trigger types
const TRIGGER_TYPES = {
  channelDelete: { label: 'Channel Delete',  desc: 'Someone deletes channels rapidly' },
  roleDelete:    { label: 'Role Delete',      desc: 'Someone deletes roles rapidly' },
  ban:           { label: 'Mass Ban',         desc: 'Someone bans members rapidly' },
  kick:          { label: 'Mass Kick',        desc: 'Someone kicks members rapidly' },
  spam:          { label: 'Message Spam',     desc: 'Someone spams messages rapidly' },
};

const PUNISHMENTS = ['removeRoles', 'kick', 'ban', 'vanish', 'timeout'];

const PUNISHMENT_LABELS = {
  removeRoles: '🛑 Remove Roles',
  kick:        '👢 Kick',
  ban:         '🔨 Ban',
  vanish:      '👻 Vanish',
  timeout:     '⏱️ Timeout',
};

module.exports = {
  name: 'antinuke',
  aliases: ['an'],
  category: 'admin',
  description: 'Manage the anti-nuke system',
  usage: '.antinuke <enable|disable|config|set|punishment|whitelist>',
  example: '.antinuke enable\n.antinuke set channelDelete 3\n.antinuke punishment ban channelDelete ban',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage anti-nuke.')] });

    const sub = args[0]?.toLowerCase();
    const an  = config.antiNuke;

    // ── enable ────────────────────────────────────────────────────────────────
    if (sub === 'enable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': true });
      return message.reply({ embeds: [successEmbed('Anti-nuke **enabled**. Use `.antinuke config` to view current settings.')] });
    }

    // ── disable ───────────────────────────────────────────────────────────────
    if (sub === 'disable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': false });
      return message.reply({ embeds: [successEmbed('Anti-nuke **disabled**.')] });
    }

    // ── config — full detailed overview ──────────────────────────────────────
    if (sub === 'config') {
      const globalPunish = PUNISHMENT_LABELS[an.punishment] || an.punishment;

      const triggerLines = Object.entries(TRIGGER_TYPES).map(([key, { label, desc }]) => {
        const threshold = an.thresholds?.[key] ?? '—';
        const perPunish = an.punishments?.[key];
        const punishDisplay = perPunish
          ? PUNISHMENT_LABELS[perPunish] || perPunish
          : `*(uses global: ${globalPunish})*`;
        return `**${label}** (\`${key}\`)\n> Trigger: **${threshold}** actions in 10s → ${punishDisplay}\n> *${desc}*`;
      });

      const embed = new EmbedBuilder()
        .setColor(an.enabled ? 0xED4245 : 0x2B2D31)
        .setTitle(`🛡️ Anti-Nuke Config — ${an.enabled ? '✅ Enabled' : '❌ Disabled'}`)
        .setDescription(triggerLines.join('\n\n'))
        .addFields(
          {
            name: '🌐 Global Punishment',
            value: `${globalPunish}\n*Applied when no per-trigger punishment is set*`,
            inline: false,
          },
          {
            name: '⏱️ Timeout Duration',
            value: `\`${config.antiNuke?.timeoutDuration || 60} minutes\` (used when punishment is timeout)`,
            inline: true,
          },
          {
            name: '🛡️ Block Personal Apps',
            value: config.antiNuke?.blockUserApps !== false ? '✅ Enabled' : '❌ Disabled',
            inline: true,
          },
          {
            name: '✅ Whitelist',
            value: an.whitelist?.length
              ? an.whitelist.map(id => `<@${id}>`).join(', ')
              : '`Nobody — everyone is monitored`',
            inline: false,
          },
        )
        .setFooter({ text: 'Use .antinuke set <trigger> <number> to change thresholds' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ── set <trigger> <number> ────────────────────────────────────────────────
    if (sub === 'set') {
      const type  = args[1];
      const value = args[2];

      if (!type || !value) {
        const typeList = Object.entries(TRIGGER_TYPES)
          .map(([key, { label }]) => `\`${key}\` — ${label}`)
          .join('\n');

        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 .antinuke set — Usage')
            .setDescription(
              '**Format:** `.antinuke set <trigger> <number>`\n\n' +
              '**Available triggers:**\n' + typeList + '\n\n' +
              '**Example:**\n' +
              '`.antinuke set channelDelete 3` → ban if 3 channels deleted in 10s\n' +
              '`.antinuke set spam 5` → punish if 5 messages spammed in 10s'
            )]
        });
      }

      // Handle special set options
      if (type === 'timeoutDuration') {
        const mins = parseInt(value);
        if (isNaN(mins) || mins < 1)
          return message.reply({ embeds: [errorEmbed('Provide a valid number of minutes.')] });
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.timeoutDuration': mins });
        return message.reply({ embeds: [successEmbed(`Timeout duration set to **${mins} minutes**.`)] });
      }

      if (type === 'blockUserApps') {
        const enabled = ['on', 'true', 'yes', 'enable'].includes(value.toLowerCase());
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.blockUserApps': enabled });
        return message.reply({ embeds: [successEmbed(`Personal app blocking **${enabled ? 'enabled' : 'disabled'}**.`)] });
      }

      if (!TRIGGER_TYPES[type])
        return message.reply({ embeds: [errorEmbed(`Unknown trigger \`${type}\`.\n\nValid triggers:\n${Object.keys(TRIGGER_TYPES).map(k => `\`${k}\``).join(', ')}`)] });

      const limit = parseInt(value);
      if (isNaN(limit) || limit < 1)
        return message.reply({ embeds: [errorEmbed('The number must be a positive integer (e.g. `3`).')] });

      await GuildConfig.updateOne(
        { guildId: message.guild.id },
        { [`antiNuke.thresholds.${type}`]: limit }
      );

      return message.reply({
        embeds: [successEmbed(
          `**${TRIGGER_TYPES[type].label}** threshold set to **${limit}** actions per 10 seconds.\n` +
          `Punishment: ${an.punishments?.[type] ? PUNISHMENT_LABELS[an.punishments[type]] : `*(global: ${PUNISHMENT_LABELS[an.punishment]})*`}`
        )]
      });
    }

    // ── punishment global OR per-trigger ─────────────────────────────────────
    // Usage A: .antinuke punishment ban             → set global punishment
    // Usage B: .antinuke punishment ban channelDelete → set per-trigger punishment
    if (sub === 'punishment') {
      const punish  = args[1]?.toLowerCase();
      const trigger = args[2]?.toLowerCase();

      if (!punish) {
        const punishList = PUNISHMENTS.map(p => `\`${p}\` — ${PUNISHMENT_LABELS[p]}`).join('\n');
        const triggerList = Object.entries(TRIGGER_TYPES).map(([k, { label }]) => `\`${k}\` — ${label}`).join('\n');

        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 .antinuke punishment — Usage')
            .setDescription(
              '**Set global punishment (applies to all triggers):**\n' +
              '`.antinuke punishment <punishment>`\n' +
              '*Example:* `.antinuke punishment ban`\n\n' +
              '**Set per-trigger punishment:**\n' +
              '`.antinuke punishment <punishment> <trigger>`\n' +
              '*Example:* `.antinuke punishment ban channelDelete`\n\n' +
              '**Available punishments:**\n' + punishList + '\n\n' +
              '**Available triggers:**\n' + triggerList
            )]
        });
      }

      if (!PUNISHMENTS.includes(punish))
        return message.reply({ embeds: [errorEmbed(`Invalid punishment \`${punish}\`.\n\nChoose from: ${PUNISHMENTS.map(p => `\`${p}\``).join(', ')}`)] });

      if (trigger) {
        // Per-trigger punishment
        if (!TRIGGER_TYPES[trigger])
          return message.reply({ embeds: [errorEmbed(`Unknown trigger \`${trigger}\`.\n\nValid: ${Object.keys(TRIGGER_TYPES).map(k => `\`${k}\``).join(', ')}`)] });

        await GuildConfig.updateOne(
          { guildId: message.guild.id },
          { [`antiNuke.punishments.${trigger}`]: punish }
        );

        return message.reply({
          embeds: [successEmbed(
            `**${TRIGGER_TYPES[trigger].label}** will now use punishment: **${PUNISHMENT_LABELS[punish]}**\n` +
            `*(Other triggers still use the global punishment unless set individually)*`
          )]
        });
      } else {
        // Global punishment
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.punishment': punish });
        return message.reply({
          embeds: [successEmbed(
            `Global punishment set to **${PUNISHMENT_LABELS[punish]}**.\n` +
            `This applies to all triggers that don't have their own punishment set.`
          )]
        });
      }
    }

    // ── whitelist add/remove ──────────────────────────────────────────────────
    if (sub === 'whitelist') {
      const action = args[1]?.toLowerCase();
      const target = await resolveMember(message.guild, args[2]);

      if (!action || !['add', 'remove', 'list'].includes(action)) {
        return message.reply({ embeds: [errorEmbed('Usage:\n`.antinuke whitelist add @user`\n`.antinuke whitelist remove @user`\n`.antinuke whitelist list`')] });
      }

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

      if (!target)
        return message.reply({ embeds: [errorEmbed('Could not find that member.')] });

      if (action === 'add') {
        if (an.whitelist.includes(target.id))
          return message.reply({ embeds: [errorEmbed('User is already whitelisted.')] });
        an.whitelist.push(target.id);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': an.whitelist });
        return message.reply({ embeds: [successEmbed(`${target} added to the anti-nuke whitelist. They bypass all triggers.`)] });
      }

      if (action === 'remove') {
        const idx = an.whitelist.indexOf(target.id);
        if (idx === -1)
          return message.reply({ embeds: [errorEmbed('That user is not whitelisted.')] });
        an.whitelist.splice(idx, 1);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': an.whitelist });
        return message.reply({ embeds: [successEmbed(`${target} removed from the anti-nuke whitelist.`)] });
      }
    }

    // ── default: show full help menu ──────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🛡️ Anti-Nuke — Command Guide')
      .setDescription('Protect your server from raids and nukes.')
      .addFields(
        {
          name: '⚡ Quick Setup',
          value: [
            '`.antinuke enable` — turn on protection',
            '`.antinuke config` — see all current settings',
            '`.antinuke disable` — turn off protection',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🎚️ Set Trigger Thresholds',
          value: [
            '`.antinuke set <trigger> <number>`',
            '',
            '**Triggers:**',
            '`channelDelete` — channels deleted',
            '`roleDelete` — roles deleted',
            '`ban` — members banned',
            '`kick` — members kicked',
            '`spam` — messages spammed',
            '',
            '**Example:** `.antinuke set channelDelete 3`',
            '*If someone deletes 3 channels in 10s → punishment fires*',
          ].join('\n'),
          inline: false,
        },
        {
          name: '⚖️ Set Punishments',
          value: [
            '**Global** (all triggers): `.antinuke punishment <punishment>`',
            '**Per trigger**: `.antinuke punishment <punishment> <trigger>`',
            '',
            '**Punishments:** `removeRoles` `kick` `ban` `vanish`',
            '',
            '**Examples:**',
            '`.antinuke punishment ban` → everyone gets banned on trigger',
            '`.antinuke punishment ban channelDelete` → only channel deletions result in ban',
            '`.antinuke punishment kick spam` → spammers get kicked',
          ].join('\n'),
          inline: false,
        },
        {
          name: '✅ Whitelist',
          value: [
            '`.antinuke whitelist add @user` — user bypasses all triggers',
            '`.antinuke whitelist remove @user` — remove from bypass',
            '`.antinuke whitelist list` — see who is whitelisted',
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: 'Run .antinuke config to see your current settings at any time' });

    return message.reply({ embeds: [embed] });
  },
};
