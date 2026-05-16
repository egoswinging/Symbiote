const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveRole } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'setrole',
  category: 'admin',
  description: 'Set owner/vanish/access role',
  usage: '.setrole <owner|vanish|access> <@role>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can set roles.')] });

    const typeMap = { owner: 'ownerRole', vanish: 'vanishRole', access: 'accessRole' };
    const type = args[0]?.toLowerCase();
    if (!typeMap[type])
      return message.reply({ embeds: [errorEmbed('Type must be: `owner`, `vanish`, or `access`')] });

    const role = resolveRole(message.guild, args[1]);
    if (!role) return message.reply({ embeds: [errorEmbed('Role not found.')] });

    await GuildConfig.updateOne({ guildId: message.guild.id }, { [typeMap[type]]: role.id });
    return message.reply({ embeds: [successEmbed(`Set **${type}** role to ${role}.`)] });
  },
};
