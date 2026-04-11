const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveRole } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'roleremove',
  aliases: [],
  category: 'admin',
  description: 'Remove a role from a tier (v1/v2/v3)',
  usage: '.roleremove <v1|v2|v3> <@role>',

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
    const idx = config[field].indexOf(role.id);
    if (idx === -1)
      return message.reply({ embeds: [errorEmbed(`${role} is not in **${tier}**.`)] });

    config[field].splice(idx, 1);
    await GuildConfig.updateOne({ guildId: message.guild.id }, { [field]: config[field] });

    return message.reply({ embeds: [successEmbed(`Removed ${role} from **${tier}** roles.`)] });
  },
};
