const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { logAction } = require('../../utils/logger');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
  name: 'on',
  category: 'admin',
  description: 'Restore each role to its own individual permissions from before .off',
  usage: '.on',
  example: '.on',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can use this.')] });

    const allRoleIds = [...config.v1Roles, ...config.v2Roles, ...config.v3Roles];
    if (!allRoleIds.length)
      return message.reply({ embeds: [errorEmbed('No roles configured in v1/v2/v3.')] });

    // Read directly from MongoDB — bypass Mongoose cache
    const freshConfig = await GuildConfig.collection.findOne({ guildId: message.guild.id });
    const raw = freshConfig?.savedRolePerms;

    console.log('Raw snapshot:', raw?.slice(0, 100));

    if (!raw || raw === '' || raw === '{}') {
      return message.reply({ embeds: [errorEmbed('No saved snapshot found. Run `.off` first.')] });
    }

    let snapshot = {};
    try {
      snapshot = JSON.parse(raw);
    } catch (e) {
      return message.reply({ embeds: [errorEmbed('Failed to read snapshot. Run `.off` again.')] });
    }

    const snapshotRoleIds = Object.keys(snapshot);
    if (!snapshotRoleIds.length)
      return message.reply({ embeds: [errorEmbed('Snapshot is empty. Run `.off` first.')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Restoring permissions to **${snapshotRoleIds.length}** roles...` }]
    });

    let rolesRestored = 0;
    const failed = [];
    const restored = [];

    for (const roleId of snapshotRoleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      const bitfield = snapshot[roleId];
      if (!bitfield) continue;

      try {
        // Restore exact original permissions
        await role.setPermissions(BigInt(bitfield), `Admin perms ON by ${message.author.tag}`);
        restored.push(role.name);
        rolesRestored++;

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        failed.push(role?.name || roleId);
        console.error(`on.js error on ${roleId}:`, err.message);
      }
    }

    // Clear snapshot
    await GuildConfig.collection.updateOne(
      { guildId: message.guild.id },
      { $set: { adminPermsEnabled: true, savedRolePerms: '' } }
    );

    await logAction(message.guild, {
      action: 'Admin Perms ON',
      moderator: message.author.id,
      target: null,
      reason: `Restored perms to ${rolesRestored} roles`,
      color: 0x57F287,
    });

    const failText = failed.length ? `\n⚠️ Failed: ${failed.map(n => `\`${n}\``).join(', ')}` : '';
    return status.edit({
      embeds: [successEmbed(
        `Permissions **restored** on **${rolesRestored}** roles.\n` +
        `Roles: ${restored.map(n => `\`${n}\``).join(', ')}` +
        failText
      )]
    });
  },
};
