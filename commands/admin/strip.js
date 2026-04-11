const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');

// .strip — remove any role that grants ban/kick/timeout permissions
module.exports = {
  name: 'strip',
  category: 'admin',
  description: 'Remove any role from a user that grants ban, kick, or timeout permissions',
  usage: '.strip <@user>',
  example: '.strip @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can strip roles.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot target someone with equal or higher permissions.')] });

    const KICK     = BigInt(0x2);
    const BAN      = BigInt(0x4);
    const MODERATE = BigInt(0x10000000);
    const ADMIN    = BigInt(0x8);

    // Find all roles that grant these permissions
    const dangerousRoles = target.roles.cache.filter(r => {
      if (r.id === message.guild.id || r.managed) return false;
      const bits = r.permissions.bitfield;
      return (bits & KICK) || (bits & BAN) || (bits & MODERATE) || (bits & ADMIN);
    });

    if (!dangerousRoles.size)
      return message.reply({ embeds: [errorEmbed('That user has no roles with ban/kick/timeout permissions.')] });

    await target.roles.remove([...dangerousRoles.keys()], `Stripped by ${message.author.tag}`);

    await logAction(message.guild, { action: 'Strip', moderator: message.author.id, target: target.id, reason: `Removed ${dangerousRoles.size} dangerous roles` });
    return message.reply({ embeds: [successEmbed(`Stripped **${dangerousRoles.size}** roles with ban/kick/timeout perms from ${target}.`)] });
  },
};
