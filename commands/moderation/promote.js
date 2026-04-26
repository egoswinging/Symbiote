const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember, resolveRole } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

// ── .pr <@user> <steps> ───────────────────────────────────────────────────────
const pr = {
  name: 'pr',
  category: 'moderation',
  description: 'Promote a user X steps up the promotion ladder',
  usage: '.pr <@user> <steps>',
  example: '.pr @John 1\n.pr @John 3 (gives them the role 3 steps above their current highest)',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher to promote members.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (target.id === message.author.id)
      return message.reply({ embeds: [errorEmbed('You cannot promote yourself.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot promote someone with equal or higher permissions.')] });

    const steps = parseInt(args[1]);
    if (isNaN(steps) || steps < 1)
      return message.reply({ embeds: [errorEmbed('Provide a valid number of steps.\n**Example:** `.pr @John 1` or `.pr @John 3`')] });

    const prRoles = config.promotionRoles || [];
    if (prRoles.length < 2)
      return message.reply({ embeds: [errorEmbed(
        'No promotion ladder configured.\n\n' +
        'Set it up with `.prsetup add @role` — add roles from **lowest to highest** rank.'
      )] });

    const protected_ = new Set(config.promotionProtectedRoles || []);

    // Find the user's HIGHEST role that exists in the promotion ladder
    // prRoles is ordered lowest → highest, so we find the last match
    const memberRoleIds = [...target.roles.cache.keys()];
    let currentIndex = -1;

    for (let i = 0; i < prRoles.length; i++) {
      if (memberRoleIds.includes(prRoles[i])) {
        currentIndex = i;
      }
    }

    // Calculate target index
    const targetIndex = currentIndex + steps;

    if (targetIndex >= prRoles.length) {
      const maxRole = message.guild.roles.cache.get(prRoles[prRoles.length - 1]);
      return message.reply({ embeds: [errorEmbed(
        `That would go beyond the top of the promotion ladder.\n` +
        `**${target.displayName}** is ${prRoles.length - 1 - currentIndex} step(s) from the top.\n` +
        `Highest available: ${maxRole || 'Unknown'}`
      )] });
    }

    const newRoleId = prRoles[targetIndex];
    const newRole   = message.guild.roles.cache.get(newRoleId);
    if (!newRole) return message.reply({ embeds: [errorEmbed('Target promotion role not found in server. Re-run `.prsetup` to fix.')] });

    // Remove all current promotion roles the user has EXCEPT protected ones
    const rolesToRemove = prRoles.filter(id => {
      if (!memberRoleIds.includes(id)) return false; // they don't have it
      if (protected_.has(id)) return false;           // it's protected — keep it
      return true;
    });

    const rolesBefore = rolesToRemove.map(id => message.guild.roles.cache.get(id)?.name || id);

    if (rolesToRemove.length > 0) {
      await target.roles.remove(rolesToRemove, `Promotion by ${message.author.tag}`).catch(() => {});
    }

    // Give them the new role
    await target.roles.add(newRoleId, `Promoted ${steps} step(s) by ${message.author.tag}`).catch(() => {});

    await logAction(message.guild, {
      action: `Promotion (+${steps})`,
      moderator: message.author.id,
      target: target.id,
      reason: `Removed: [${rolesBefore.join(', ') || 'none'}] → Promoted to: ${newRole.name}`,
      color: 0x57F287,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('⬆️ Promotion')
      .addFields(
        { name: 'Member',    value: `${target} (${target.user.tag})`, inline: true },
        { name: 'Steps',     value: `+${steps}`,                       inline: true },
        { name: 'New Rank',  value: newRole.toString(),                 inline: true },
        { name: 'Removed',   value: rolesBefore.length ? rolesBefore.map(n => `\`${n}\``).join(', ') : '`None`', inline: false },
        { name: 'By',        value: `${message.author}`,               inline: false },
      )
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

// ── .prsetup — configure the promotion ladder ──────────────────────────────
const prsetup = {
  name: 'prsetup',
  category: 'moderation',
  description: 'Configure the promotion role ladder',
  usage: '.prsetup <add|remove|list|clear> [@role]',
  example: '.prsetup add @Recruit\n.prsetup add @Member\n.prsetup add @Veteran\n.prsetup list',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can configure the promotion ladder.')] });

    const sub = args[0]?.toLowerCase();

    // ── list ─────────────────────────────────────────────────────────────────
    if (!sub || sub === 'list') {
      const prRoles    = config.promotionRoles || [];
      const protected_ = config.promotionProtectedRoles || [];

      if (!prRoles.length)
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle('📋 Promotion Ladder')
          .setDescription('No roles configured yet.\nUse `.prsetup add @role` to add roles **from lowest to highest rank**.')
        ] });

      const lines = prRoles.map((id, i) => {
        const role     = message.guild.roles.cache.get(id);
        const isTop    = i === prRoles.length - 1;
        const isProt   = protected_.includes(id);
        const label    = role ? role.toString() : `Unknown (${id})`;
        const tags     = [isTop ? '👑 TOP' : `#${i + 1}`, isProt ? '🛡️ Protected' : ''].filter(Boolean).join(' · ');
        return `\`${i + 1}.\` ${label} ${tags ? `— *${tags}*` : ''}`;
      });

      const protLines = protected_
        .filter(id => !prRoles.includes(id))
        .map(id => {
          const role = message.guild.roles.cache.get(id);
          return `🛡️ ${role ? role.toString() : `Unknown (${id})`} — *Protected (not in ladder)*`;
        });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Promotion Ladder (Lowest → Highest)')
        .setDescription([...lines, ...(protLines.length ? ['', '**Extra Protected Roles:**', ...protLines] : [])].join('\n'))
        .setFooter({ text: '.prsetup add @role to add • .prsetup protect @role to protect' });

      return message.reply({ embeds: [embed] });
    }

    // ── add @role — add to ladder (appends to top) ───────────────────────────
    if (sub === 'add') {
      const role = resolveRole(message.guild, args[1]);
      if (!role) return message.reply({ embeds: [errorEmbed('Role not found.')] });

      const prRoles = config.promotionRoles || [];
      if (prRoles.includes(role.id))
        return message.reply({ embeds: [errorEmbed(`${role} is already in the promotion ladder.`)] });

      prRoles.push(role.id);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { promotionRoles: prRoles });

      return message.reply({ embeds: [successEmbed(
        `Added ${role} to the promotion ladder at position **#${prRoles.length}** (top).\n` +
        `Total roles in ladder: **${prRoles.length}**\n\n` +
        `💡 Roles are ordered by when you add them. Add from **lowest → highest rank**.`
      )] });
    }

    // ── remove @role ──────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const role = resolveRole(message.guild, args[1]);
      if (!role) return message.reply({ embeds: [errorEmbed('Role not found.')] });

      const prRoles = config.promotionRoles || [];
      const idx = prRoles.indexOf(role.id);
      if (idx === -1)
        return message.reply({ embeds: [errorEmbed(`${role} is not in the promotion ladder.`)] });

      prRoles.splice(idx, 1);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { promotionRoles: prRoles });

      return message.reply({ embeds: [successEmbed(`Removed ${role} from the promotion ladder.`)] });
    }

    // ── protect @role — add to protected list ─────────────────────────────────
    if (sub === 'protect') {
      const role = resolveRole(message.guild, args[1]);
      if (!role) return message.reply({ embeds: [errorEmbed('Role not found.')] });

      const protected_ = config.promotionProtectedRoles || [];
      if (protected_.includes(role.id))
        return message.reply({ embeds: [errorEmbed(`${role} is already protected.`)] });

      protected_.push(role.id);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { promotionProtectedRoles: protected_ });

      return message.reply({ embeds: [successEmbed(
        `${role} is now **protected** — it will never be removed during promotions.\n\n` +
        `This is useful for roles like \`ROOT ACCESS\`, \`----HR----\`, \`----MR----\` dividers etc.`
      )] });
    }

    // ── unprotect @role ───────────────────────────────────────────────────────
    if (sub === 'unprotect') {
      const role = resolveRole(message.guild, args[1]);
      if (!role) return message.reply({ embeds: [errorEmbed('Role not found.')] });

      const protected_ = config.promotionProtectedRoles || [];
      const idx = protected_.indexOf(role.id);
      if (idx === -1)
        return message.reply({ embeds: [errorEmbed(`${role} is not protected.`)] });

      protected_.splice(idx, 1);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { promotionProtectedRoles: protected_ });

      return message.reply({ embeds: [successEmbed(`Removed protection from ${role}.`)] });
    }

    // ── clear — wipe entire ladder ────────────────────────────────────────────
    if (sub === 'clear') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { promotionRoles: [], promotionProtectedRoles: [] });
      return message.reply({ embeds: [successEmbed('Promotion ladder cleared.')] });
    }

    return message.reply({ embeds: [errorEmbed(
      'Usage: `.prsetup <add|remove|protect|unprotect|list|clear> [@role]`\n\n' +
      '**Examples:**\n' +
      '`.prsetup add @Recruit` — add Recruit to ladder\n' +
      '`.prsetup add @Member` — add Member above Recruit\n' +
      '`.prsetup protect @ROOT-ACCESS` — never delete ROOT ACCESS during promotions\n' +
      '`.prsetup list` — view the full ladder'
    )] });
  },
};

// ── .dem — demote a user ──────────────────────────────────────────────────────
const dem = {
  name: 'dem',
  category: 'moderation',
  description: 'Demote a user X steps down the promotion ladder',
  usage: '.dem <@user> <steps>',
  example: '.dem @John 1\n.dem @John 2',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher to demote members.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot demote someone with equal or higher permissions.')] });

    const steps = parseInt(args[1]);
    if (isNaN(steps) || steps < 1)
      return message.reply({ embeds: [errorEmbed('Provide a valid number of steps.\n**Example:** `.dem @John 1`')] });

    const prRoles = config.promotionRoles || [];
    if (prRoles.length < 2)
      return message.reply({ embeds: [errorEmbed('No promotion ladder configured. Use `.prsetup add @role` first.')] });

    const protected_ = new Set(config.promotionProtectedRoles || []);
    const memberRoleIds = [...target.roles.cache.keys()];

    // Find highest promotion role the member has
    let currentIndex = -1;
    for (let i = 0; i < prRoles.length; i++) {
      if (memberRoleIds.includes(prRoles[i])) currentIndex = i;
    }

    if (currentIndex === -1)
      return message.reply({ embeds: [errorEmbed(`${target.displayName} has no roles in the promotion ladder.`)] });

    const targetIndex = currentIndex - steps;
    if (targetIndex < 0)
      return message.reply({ embeds: [errorEmbed(`That would go below the bottom of the ladder. ${target.displayName} is at position #${currentIndex + 1}.`)] });

    const newRoleId = prRoles[targetIndex];
    const newRole   = message.guild.roles.cache.get(newRoleId);
    if (!newRole) return message.reply({ embeds: [errorEmbed('Target role not found. Re-run `.prsetup` to fix.')] });

    // Remove all current promotion roles except protected
    const rolesToRemove = prRoles.filter(id => memberRoleIds.includes(id) && !protected_.has(id));
    const rolesBefore   = rolesToRemove.map(id => message.guild.roles.cache.get(id)?.name || id);

    if (rolesToRemove.length > 0) {
      await target.roles.remove(rolesToRemove, `Demotion by ${message.author.tag}`).catch(() => {});
    }
    await target.roles.add(newRoleId, `Demoted ${steps} step(s) by ${message.author.tag}`).catch(() => {});

    await logAction(message.guild, {
      action: `Demotion (-${steps})`,
      moderator: message.author.id,
      target: target.id,
      reason: `Removed: [${rolesBefore.join(', ')}] → Demoted to: ${newRole.name}`,
      color: 0xED4245,
    });

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('⬇️ Demotion')
      .addFields(
        { name: 'Member',   value: `${target} (${target.user.tag})`, inline: true },
        { name: 'Steps',    value: `-${steps}`,                       inline: true },
        { name: 'New Rank', value: newRole.toString(),                 inline: true },
        { name: 'Removed',  value: rolesBefore.length ? rolesBefore.map(n => `\`${n}\``).join(', ') : '`None`', inline: false },
        { name: 'By',       value: `${message.author}`,               inline: false },
      )
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

module.exports = [pr, prsetup, dem];
