const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const AutoResponder = require('../../models/AutoResponder');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'autoresponder',
  aliases: ['ar'],
  category: 'utility',
  description: 'Manage auto-responders (keyword → response)',
  usage: '.autoresponder <add|remove|list> [trigger] [response]',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const sub = args[0]?.toLowerCase();

    // ── list ──────────────────────────────────────────────────────────────────
    if (!sub || sub === 'list') {
      const all = await AutoResponder.find({ guildId: message.guild.id });
      if (!all.length)
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No auto-responders configured.')] });

      const lines = all.map((ar, i) => `\`${i + 1}.\` **${ar.trigger}** → ${ar.response.slice(0, 60)}${ar.response.length > 60 ? '…' : ''}`);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🤖 Auto-Responders — ${all.length}`)
          .setDescription(lines.join('\n'))]
      });
    }

    // ── add <trigger> | <response> ────────────────────────────────────────────
    if (sub === 'add') {
      const rest = args.slice(1).join(' ');
      const sep  = rest.indexOf('|');
      if (sep === -1)
        return message.reply({ embeds: [errorEmbed('Usage: `.ar add <trigger> | <response>`')] });

      const trigger  = rest.slice(0, sep).trim().toLowerCase();
      const response = rest.slice(sep + 1).trim();

      if (!trigger || !response)
        return message.reply({ embeds: [errorEmbed('Both trigger and response are required.')] });
      if (trigger.length > 100)
        return message.reply({ embeds: [errorEmbed('Trigger must be under 100 characters.')] });
      if (response.length > 500)
        return message.reply({ embeds: [errorEmbed('Response must be under 500 characters.')] });

      const count = await AutoResponder.countDocuments({ guildId: message.guild.id });
      if (count >= 50)
        return message.reply({ embeds: [errorEmbed('Maximum of **50** auto-responders per server.')] });

      await AutoResponder.findOneAndUpdate(
        { guildId: message.guild.id, trigger },
        { response },
        { upsert: true }
      );

      return message.reply({ embeds: [successEmbed(`Auto-responder added:\n**Trigger:** \`${trigger}\`\n**Response:** ${response}`)] });
    }

    // ── remove <trigger> ──────────────────────────────────────────────────────
    if (sub === 'remove') {
      const trigger = args.slice(1).join(' ').toLowerCase();
      if (!trigger)
        return message.reply({ embeds: [errorEmbed('Provide the trigger to remove.')] });

      const result = await AutoResponder.deleteOne({ guildId: message.guild.id, trigger });
      if (!result.deletedCount)
        return message.reply({ embeds: [errorEmbed(`No auto-responder found for trigger: \`${trigger}\``)] });

      return message.reply({ embeds: [successEmbed(`Removed auto-responder: \`${trigger}\``)] });
    }

    return message.reply({ embeds: [errorEmbed('Usage: `.ar <add|remove|list>`')] });
  },
};
