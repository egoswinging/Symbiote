const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { logAction } = require('../../utils/logger');
const GuildConfig = require('../../models/GuildConfig');
const { PermissionsBitField } = require('discord.js');

// Permissions to RESTORE when .on is used
const GRANT_PERMS = [
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.ModerateMembers,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.MuteMembers,
  PermissionsBitField.Flags.DeafenMembers,
  PermissionsBitField.Flags.MoveMembers,
  PermissionsBitField.Flags.ViewAuditLog,
  PermissionsBitField.Flags.ChangeNickname,
  PermissionsBitField.Flags.ManageNicknames,
  PermissionsBitField.Flags.MentionEveryone,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageEmojisAndStickers,
  PermissionsBitField.Flags.SendTTSMessages,
];

module.exports = {
  name: 'on',
  category: 'admin',
  description: 'Turn ON all admin/mod permissions for v1/v2/v3 roles and restore bot permissions',
  usage: '.on',
  example: '.on',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can use this.')] });

    const allRoleIds = [...config.v1Roles, ...config.v2Roles, ...config.v3Roles];
    if (!allRoleIds.length)
      return message.reply({ embeds: [errorEmbed('No roles configured in v1/v2/v3. Use `.roleadd` first.')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: '⏳ Restoring permissions to v1/v2/v3 roles...' }]
    });

    let rolesUpdated = 0;
    let botsRestored = 0;
    const failed = [];

    for (const roleId of allRoleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      try {
        // Add all permissions back
        let newBits = role.permissions.bitfield;
        for (const perm of GRANT_PERMS) {
          newBits = newBits | perm;
        }
        await role.setPermissions(newBits, `Admin perms ON by ${message.author.tag}`);
        rolesUpdated++;

        // Restore channel overwrites for any bots in this tier
        await message.guild.members.fetch();
        const botsWithRole = message.guild.members.cache.filter(m =>
          m.user.bot && m.roles.cache.has(roleId)
        );

        for (const [, botMember] of botsWithRole) {
          const botManagedRole = botMember.roles.cache.find(r => r.managed && r.id !== message.guild.id);
          if (!botManagedRole) continue;

          // Remove the deny overwrites we added with .off
          const channels = message.guild.channels.cache.filter(c => c.type !== 4);
          for (const [, ch] of channels) {
            const overwrite = ch.permissionOverwrites.cache.get(botManagedRole.id);
            if (overwrite) {
              await ch.permissionOverwrites.delete(botManagedRole, `Bot perms restored via .on by ${message.author.tag}`).catch(() => {});
            }
          }
          botsRestored++;
        }
      } catch (err) {
        failed.push(role?.name || roleId);
      }
    }

    await GuildConfig.updateOne({ guildId: message.guild.id }, { adminPermsEnabled: true });

    await logAction(message.guild, {
      action: 'Admin Perms ON',
      moderator: message.author.id,
      target: null,
      reason: `Restored perms to ${rolesUpdated} roles, re-enabled ${botsRestored} bots`,
      color: 0x57F287,
    });

    const failText = failed.length ? `\n⚠️ Failed on: ${failed.map(n => `\`${n}\``).join(', ')}` : '';
    return status.edit({
      embeds: [successEmbed(
        `All admin/mod permissions **restored** on **${rolesUpdated}** roles.\n` +
        `**${botsRestored}** bots in those tiers have been re-enabled.` +
        failText
      )]
    });
  },
};
