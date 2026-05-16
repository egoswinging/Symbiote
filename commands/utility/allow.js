const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveRole } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');
const { EmbedBuilder } = require('discord.js');

// .allow — set a role as allowed to ping @everyone (max 3 per 5 min)
module.exports = {
  name: 'allow',
  category: 'utility',
  description: 'Allow a role to ping @everyone (max 3 times per 5 minutes before timeout)',
  usage: '.allow <@role>',
  example: '.allow @Announcements',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage allowed ping roles.')] });

    if (!args[0]) {
      // Show current allowed roles
      if (!config.allowedPingRoles?.length)
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No roles are currently allowed to ping @everyone.')] });

      const lines = config.allowedPingRoles.map((id, i) => `\`${i + 1}.\` <@&${id}>`);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('✅ Allowed Ping Roles').setDescription(lines.join('\n')).setFooter({ text: 'Max 3 pings per 5 minutes — timeout on violation' })] });
    }

    const role = resolveRole(message.guild, args[0]);
    if (!role) return message.reply({ embeds: [errorEmbed('Role not found.')] });

    const current = config.allowedPingRoles || [];

    if (current.includes(role.id)) {
      // Toggle off — remove the role
      const updated = current.filter(id => id !== role.id);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { allowedPingRoles: updated });
      return message.reply({ embeds: [successEmbed(`${role} removed from allowed ping roles.`)] });
    } else {
      current.push(role.id);
      await GuildConfig.updateOne({ guildId: message.guild.id }, { allowedPingRoles: current });
      return message.reply({ embeds: [successEmbed(`${role} can now ping @everyone (max 3x per 5 min — violations result in timeout + log).`)] });
    }
  },
};
