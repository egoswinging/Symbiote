const { requireTier } = require('../../utils/permissions');
const { errorEmbed, infoEmbed } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'rolelist',
  category: 'admin',
  description: 'View all roles in v1/v2/v3',
  usage: '.rolelist <v1|v2|v3>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const tier = args[0]?.toLowerCase();
    if (!['v1', 'v2', 'v3'].includes(tier))
      return message.reply({ embeds: [errorEmbed('Specify: `v1`, `v2`, or `v3`')] });

    const roleIds = config[`${tier}Roles`] || [];
    if (!roleIds.length)
      return message.reply({ embeds: [infoEmbed(`No roles configured for **${tier}**.`)] });

    const lines = roleIds.map((id, i) => {
      const role = message.guild.roles.cache.get(id);
      return `\`${i + 1}.\` ${role ? role.toString() : `Unknown (${id})`}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${tier.toUpperCase()} Roles`)
      .setDescription(lines.join('\n'));

    return message.reply({ embeds: [embed] });
  },
};
