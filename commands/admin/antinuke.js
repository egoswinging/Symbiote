const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'antinuke',
  aliases: ['an'],
  category: 'admin',
  description: 'Manage the anti-nuke system',
  usage: '.antinuke <enable|disable|config|set|whitelist>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage anti-nuke.')] });

    const sub = args[0]?.toLowerCase();

    // ── enable ────────────────────────────────────────────────────────────────
    if (sub === 'enable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': true });
      return message.reply({ embeds: [successEmbed('Anti-nuke system **enabled**.')] });
    }

    // ── disable ───────────────────────────────────────────────────────────────
    if (sub === 'disable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.enabled': false });
      return message.reply({ embeds: [successEmbed('Anti-nuke system **disabled**.')] });
    }

    // ── config ────────────────────────────────────────────────────────────────
    if (sub === 'config') {
      const an = config.antiNuke;
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🛡️ Anti-Nuke Config')
        .addFields(
          { name: 'Status',        value: an.enabled ? '✅ Enabled' : '❌ Disabled',        inline: true },
          { name: 'Punishment',    value: `\`${an.punishment}\``,                            inline: true },
          { name: 'Channel Del.',  value: `\`${an.thresholds.channelDelete}\` per 10s`,      inline: true },
          { name: 'Role Del.',     value: `\`${an.thresholds.roleDelete}\` per 10s`,         inline: true },
          { name: 'Bans',          value: `\`${an.thresholds.ban}\` per 10s`,                inline: true },
          { name: 'Kicks',         value: `\`${an.thresholds.kick}\` per 10s`,               inline: true },
          {
            name: 'Whitelist',
            value: an.whitelist.length ? an.whitelist.map(id => `<@${id}>`).join(', ') : '`None`',
            inline: false,
          },
        );
      return message.reply({ embeds: [embed] });
    }

    // ── set <type> <limit> ────────────────────────────────────────────────────
    if (sub === 'set') {
      // ,antinuke set channelDelete 3
      // ,antinuke set punishment ban
      const type  = args[1];
      const value = args[2];
      if (!type || !value)
        return message.reply({ embeds: [errorEmbed('Usage: `.antinuke set <type> <value>`\nTypes: `channelDelete`, `roleDelete`, `ban`, `kick`, `punishment`')] });

      if (type === 'punishment') {
        const valid = ['removeRoles', 'kick', 'ban', 'vanish'];
        if (!valid.includes(value))
          return message.reply({ embeds: [errorEmbed(`Punishment must be one of: ${valid.map(v => `\`${v}\``).join(', ')}`)] });
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.punishment': value });
        return message.reply({ embeds: [successEmbed(`Punishment set to **${value}**.`)] });
      }

      const thresholdTypes = ['channelDelete', 'roleDelete', 'ban', 'kick'];
      if (!thresholdTypes.includes(type))
        return message.reply({ embeds: [errorEmbed(`Type must be one of: ${thresholdTypes.map(t => `\`${t}\``).join(', ')}`)] });

      const limit = parseInt(value);
      if (isNaN(limit) || limit < 1)
        return message.reply({ embeds: [errorEmbed('Limit must be a positive number.')] });

      await GuildConfig.updateOne(
        { guildId: message.guild.id },
        { [`antiNuke.thresholds.${type}`]: limit }
      );
      return message.reply({ embeds: [successEmbed(`Set **${type}** threshold to **${limit}** per 10s.`)] });
    }

    // ── whitelist add/remove ──────────────────────────────────────────────────
    if (sub === 'whitelist') {
      const action = args[1]?.toLowerCase();
      const target = await resolveMember(message.guild, args[2]);
      if (!target)
        return message.reply({ embeds: [errorEmbed('Could not find that member.')] });

      if (action === 'add') {
        if (config.antiNuke.whitelist.includes(target.id))
          return message.reply({ embeds: [errorEmbed('User already whitelisted.')] });
        config.antiNuke.whitelist.push(target.id);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': config.antiNuke.whitelist });
        return message.reply({ embeds: [successEmbed(`Added ${target} to anti-nuke whitelist.`)] });
      }

      if (action === 'remove') {
        const idx = config.antiNuke.whitelist.indexOf(target.id);
        if (idx === -1) return message.reply({ embeds: [errorEmbed('User is not whitelisted.')] });
        config.antiNuke.whitelist.splice(idx, 1);
        await GuildConfig.updateOne({ guildId: message.guild.id }, { 'antiNuke.whitelist': config.antiNuke.whitelist });
        return message.reply({ embeds: [successEmbed(`Removed ${target} from anti-nuke whitelist.`)] });
      }

      return message.reply({ embeds: [errorEmbed('Usage: `.antinuke whitelist <add|remove> <@user>`')] });
    }

    return message.reply({ embeds: [infoEmbed('**Anti-Nuke Commands:**\n`.antinuke enable`\n`.antinuke disable`\n`.antinuke config`\n`.antinuke set <type> <value>`\n`.antinuke whitelist <add|remove> <@user>`')] });
  },
};
