const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'resetrole',
  category: 'admin',
  description: 'Reset a config key for this guild',
  usage: '.resetrole <owner|vanish|access|v1|v2|v3>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can reset roles.')] });

    const resetMap = {
      owner:  { ownerRole: null },
      vanish: { vanishRole: null },
      access: { accessRole: null },
      v1:     { v1Roles: [] },
      v2:     { v2Roles: [] },
      v3:     { v3Roles: [] },
    };

    const type = args[0]?.toLowerCase();
    if (!resetMap[type])
      return message.reply({ embeds: [errorEmbed('Type must be: `owner`, `vanish`, `access`, `v1`, `v2`, `v3`')] });

    await GuildConfig.updateOne({ guildId: message.guild.id }, resetMap[type]);
    return message.reply({ embeds: [successEmbed(`Reset **${type}** config.`)] });
  },
};
