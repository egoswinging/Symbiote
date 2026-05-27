const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'automod',
  aliases: ['am'],
  category: 'utility',
  description: 'Manage the automod word/link filter',
  usage: '.automod <enable|disable|add|remove|list|setchannel>',
  example: '.automod add word badword\n.automod add link spam.com\n.automod setchannel #logs',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage automod.')] });

    const sub = args[0]?.toLowerCase();

    // ── enable ────────────────────────────────────────────────────────────────
    if (sub === 'enable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'automod.enabled': true });
      return message.reply({ embeds: [successEmbed('Automod **enabled**.')] });
    }

    // ── disable ───────────────────────────────────────────────────────────────
    if (sub === 'disable') {
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'automod.enabled': false });
      return message.reply({ embeds: [successEmbed('Automod **disabled**.')] });
    }

    // ── setchannel ────────────────────────────────────────────────────────────
    if (sub === 'setchannel') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply({ embeds: [errorEmbed('Mention a channel or provide a channel ID.')] });
      await GuildConfig.updateOne({ guildId: message.guild.id }, { 'automod.channel': ch.id });
      return message.reply({ embeds: [successEmbed(`Automod logs will be sent to ${ch}.`)] });
    }

    // ── add word/link ─────────────────────────────────────────────────────────
    if (sub === 'add') {
      const type  = args[1]?.toLowerCase(); // 'word' or 'link'
      const value = args.slice(2).join(' ').toLowerCase().trim(); // Always stored lowercase so 'Negus' catches 'Yo Negus'

      if (!['word', 'link'].includes(type) || !value)
        return message.reply({ embeds: [errorEmbed('Usage: `.automod add <word|link> <value>`')] });

      const field = type === 'word' ? 'automod.words' : 'automod.links';
      const list  = type === 'word' ? config.automod?.words : config.automod?.links;

      if (list?.includes(value))
        return message.reply({ embeds: [errorEmbed(`\`${value}\` is already in the ${type} filter.`)] });

      await GuildConfig.updateOne(
        { guildId: message.guild.id },
        { $push: { [field]: value }, $set: { 'automod.enabled': true } }
      );
      return message.reply({ embeds: [successEmbed(`Added \`${value}\` to the **${type}** filter and enabled automod.`)] });
    }

    // ── remove word/link ──────────────────────────────────────────────────────
    if (sub === 'remove') {
      const type  = args[1]?.toLowerCase();
      const value = args.slice(2).join(' ').toLowerCase().trim(); // Always stored lowercase so 'Negus' catches 'Yo Negus'

      if (!['word', 'link'].includes(type) || !value)
        return message.reply({ embeds: [errorEmbed('Usage: `.automod remove <word|link> <value>`')] });

      const field = type === 'word' ? 'automod.words' : 'automod.links';
      await GuildConfig.updateOne({ guildId: message.guild.id }, { $pull: { [field]: value } });
      return message.reply({ embeds: [successEmbed(`Removed \`${value}\` from the **${type}** filter.`)] });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (!sub || sub === 'list') {
      const am = config.automod || {};
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Automod Config')
        .addFields(
          { name: 'Status',   value: am.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Log Channel', value: am.channel ? `<#${am.channel}>` : '`Not set`', inline: true },
          { name: '🚫 Banned Words', value: am.words?.length ? am.words.map(w => `\`${w}\``).join(', ') : '`None`', inline: false },
          { name: '🔗 Banned Links', value: am.links?.length ? am.links.map(l => `\`${l}\``).join(', ') : '`None`', inline: false },
        );
      return message.reply({ embeds: [embed] });
    }

    return message.reply({ embeds: [errorEmbed('Usage: `.automod <enable|disable|add|remove|list|setchannel>`')] });
  },
};
