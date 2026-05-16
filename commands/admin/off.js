const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { logAction } = require('../../utils/logger');
const GuildConfig = require('../../models/GuildConfig');
const UserData = require('../../models/UserData');

module.exports = {
  name: 'off',
  category: 'admin',
  description: 'Strip ALL perms from every role in v1/v2/v3 — saves each role individually',
  usage: '.off',
  example: '.off',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can use this.')] });

    const allRoleIds = [...config.v1Roles, ...config.v2Roles, ...config.v3Roles];
    if (!allRoleIds.length)
      return message.reply({ embeds: [errorEmbed('No roles configured in v1/v2/v3.')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Saving snapshot and stripping **${allRoleIds.length}** roles...` }]
    });

    let rolesUpdated = 0;
    const failed = [];
    const snapshot = {};

    for (const roleId of allRoleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      try {
        // Save this role's unique permissions BEFORE stripping
        snapshot[roleId] = role.permissions.bitfield.toString();

        // Strip to zero
        await role.setPermissions(BigInt(0), `Admin perms OFF by ${message.author.tag}`);
        rolesUpdated++;

        // Small delay between each role to avoid rate limits
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        failed.push(role?.name || roleId);
        console.error(`off.js error on ${roleId}:`, err.message);
      }
    }

    // Save snapshot directly to MongoDB
    const snapshotStr = JSON.stringify(snapshot);
    await GuildConfig.collection.updateOne(
      { guildId: message.guild.id },
      { $set: { adminPermsEnabled: false, savedRolePerms: snapshotStr } }
    );

    // Verify save worked
    const verify = await GuildConfig.collection.findOne({ guildId: message.guild.id });
    console.log('Verified snapshot saved:', verify?.savedRolePerms?.slice(0, 100));

    await logAction(message.guild, {
      action: 'Admin Perms OFF',
      moderator: message.author.id,
      target: null,
      reason: `Stripped ${rolesUpdated} roles, snapshot saved`,
      color: 0xED4245,
    });

    const failText = failed.length ? `\n⚠️ Failed (Discord limitation): ${failed.map(n => `\`${n}\``).join(', ')}` : '';
    return status.edit({
      embeds: [successEmbed(
        `Permissions **stripped** from **${rolesUpdated}** roles.\n` +
        `✅ Snapshot saved — use \`.on\` to restore each role individually.` +
        failText
      )]
    });
  },
};
