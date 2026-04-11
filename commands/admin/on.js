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

    // Read directly from MongoDB to bypass any Mongoose caching issues
    const freshConfig = await GuildConfig.collection.findOne({ guildId: message.guild.id });
    console.log('Fresh config savedRolePerms:', freshConfig?.savedRolePerms);

    const raw = freshConfig?.savedRolePerms;
    if (!raw || raw === '' || raw === '{}') {
      return message.reply({ embeds: [errorEmbed('No saved snapshot found. Run `.off` first to save permissions, then `.on` to restore.')] });
    }

    let snapshot = {};
    try {
      snapshot = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse snapshot:', e.message);
      return message.reply({ embeds: [errorEmbed('Failed to read snapshot. Run `.off` again to create a fresh one.')] });
    }

    const snapshotRoleIds = Object.keys(snapshot);
    if (!snapshotRoleIds.length) {
      return message.reply({ embeds: [errorEmbed('Snapshot is empty. Run `.off` first.')] });
    }

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Restoring individual permissions to **${snapshotRoleIds.length}** roles...` }]
    });

    await message.guild.members.fetch();

    let rolesRestored = 0;
    let botsRestored = 0;
    const failed = [];
    const restored = [];

    for (const roleId of snapshotRoleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      const bitfield = snapshot[roleId];
      if (!bitfield) continue;

      try {
        // Restore this role's exact original permissions
        await role.setPermissions(BigInt(bitfield), `Admin perms ON by ${message.author.tag}`);
        restored.push(role.name);
        rolesRestored++;

        // Remove bot channel overwrites
        const botsWithRole = message.guild.members.cache.filter(m =>
          m.user.bot && m.roles.cache.has(roleId)
        );
        for (const [, botMember] of botsWithRole) {
          const botManagedRole = botMember.roles.cache.find(r => r.managed && r.id !== message.guild.id);
          if (!botManagedRole) continue;
          const channels = message.guild.channels.cache.filter(c => c.type !== 4);
          for (const [, ch] of channels) {
            const overwrite = ch.permissionOverwrites.cache.get(botManagedRole.id);
            if (overwrite) await ch.permissionOverwrites.delete(botManagedRole).catch(() => {});
          }
          botsRestored++;
        }

        // Remove ST/IC individual overwrites
        const channels = message.guild.channels.cache.filter(c => c.type !== 4);
        const membersInRole = message.guild.members.cache.filter(m =>
          !m.user.bot && m.roles.cache.has(roleId)
        );
        for (const [, member] of membersInRole) {
          for (const [, ch] of channels) {
            const overwrite = ch.permissionOverwrites.cache.get(member.id);
            if (overwrite) await ch.permissionOverwrites.delete(member.id).catch(() => {});
          }
        }

      } catch (err) {
        failed.push(role?.name || roleId);
        console.error(`on.js error on ${roleId}:`, err.message);
      }
    }

    // Clear snapshot from DB
    await GuildConfig.collection.updateOne(
      { guildId: message.guild.id },
      { $set: { adminPermsEnabled: true, savedRolePerms: '' } }
    );

    await logAction(message.guild, {
      action: 'Admin Perms ON',
      moderator: message.author.id,
      target: null,
      reason: `Restored individual perms to ${rolesRestored} roles`,
      color: 0x57F287,
    });

    const failText = failed.length ? `\n⚠️ Failed: ${failed.map(n => `\`${n}\``).join(', ')}` : '';
    return status.edit({
      embeds: [successEmbed(
        `Individual permissions **restored** on **${rolesRestored}** roles.\n` +
        `**${botsRestored}** bots re-enabled.\n` +
        `Roles: ${restored.map(n => `\`${n}\``).join(', ')}` +
        failText
      )]
    });
  },
};
