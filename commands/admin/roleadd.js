const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveRole } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'roleadd',
  aliases: [],
  category: 'admin',
  description: 'Add a role to a tier (v1/v2/v3)',
  usage: '.roleadd <v1|v2|v3> <@role>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can configure roles.')] });

    const tier = args[0]?.toLowerCase();
    if (!['v1', 'v2', 'v3'].includes(tier))
      return message.reply({ embeds: [errorEmbed('Specify tier: `v1`, `v2`, or `v3`')] });

    const role = resolveRole(message.guild, args[1]);
    if (!role)
      return message.reply({ embeds: [errorEmbed('Could not find that role.')] });

    const field = `${tier}Roles`;
    if (config[field].includes(role.id))
      return message.reply({ embeds: [errorEmbed(`${role} is already in **${tier}**.`)] });

    config[field].push(role.id);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { [field]: config[field] });

    return message.reply({ embeds: [successEmbed(`Added ${role} to **${tier}** roles.`)] });
  },
};
