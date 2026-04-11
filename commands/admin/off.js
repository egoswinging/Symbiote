const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { logAction } = require('../../utils/logger');
const GuildConfig = require('../../models/GuildConfig');
const UserData = require('../../models/UserData');
const { PermissionsBitField } = require('discord.js');

const STRIP_PERMS = [
  PermissionsBitField.Flags.Administrator,
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
  name: 'off',
  category: 'admin',
  description: 'Strip ALL admin/mod perms from v1/v2/v3 roles and their bots (ST + inner circle are immune)',
  usage: '.off',
  example: '.off',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can use this.')] });

    const allRoleIds = [...config.v1Roles, ...config.v2Roles, ...config.v3Roles];
    if (!allRoleIds.length)
      return message.reply({ embeds: [errorEmbed('No roles configured in v1/v2/v3.')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: '⏳ Stripping permissions... (ST and inner circle are immune)' }]
    });

    // Fetch all protected users (ST + inner circle) so we can skip them
    const protectedUsers = await UserData.find({
      guildId: message.guild.id,
      $or: [{ isSecret: true }, { isInnerCircle: true }],
    }).lean();
    const protectedIds = new Set(protectedUsers.map(u => u.userId));

    // Also always protect the bot owner
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    for (const id of ownerIds) protectedIds.add(id);

    let rolesUpdated = 0;
    let botsDisabled = 0;
    const failed = [];

    await message.guild.members.fetch();

    for (const roleId of allRoleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      try {
        // Strip perms from the role itself
        let newBits = role.permissions.bitfield;
        for (const perm of STRIP_PERMS) newBits = newBits & ~perm;
        await role.setPermissions(newBits, `Admin perms OFF by ${message.author.tag}`);
        rolesUpdated++;

        // Find bots in this tier role
        const botsWithRole = message.guild.members.cache.filter(m =>
          m.user.bot && m.roles.cache.has(roleId)
        );

        for (const [, botMember] of botsWithRole) {
          // Skip if bot owner is somehow a bot (shouldn't happen but safety check)
          if (protectedIds.has(botMember.id)) continue;

          const botManagedRole = botMember.roles.cache.find(r => r.managed && r.id !== message.guild.id);
          if (!botManagedRole) continue;

          // Deny permissions via channel overwrites (managed roles can't be edited directly)
          const channels = message.guild.channels.cache.filter(c => c.type !== 4);
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(botManagedRole, {
              SendMessages:    false,
              ManageMessages:  false,
              ManageChannels:  false,
              ManageRoles:     false,
              BanMembers:      false,
              KickMembers:     false,
              ModerateMembers: false,
              MuteMembers:     false,
              DeafenMembers:   false,
              MoveMembers:     false,
              ManageWebhooks:  false,
              MentionEveryone: false,
              ViewAuditLog:    false,
              ManageNicknames: false,
            }, `Bot locked via .off by ${message.author.tag}`).catch(() => {});
          }
          botsDisabled++;
        }

        // Now add individual channel overwrites for ST/inner circle members
        // so they KEEP their permissions even though the role lost them
        const protectedMembersInRole = message.guild.members.cache.filter(m =>
          !m.user.bot && m.roles.cache.has(roleId) && protectedIds.has(m.id)
        );

        if (protectedMembersInRole.size > 0) {
          const channels = message.guild.channels.cache.filter(c => c.type !== 4);
          for (const [, member] of protectedMembersInRole) {
            for (const [, ch] of channels) {
              await ch.permissionOverwrites.edit(member, {
                SendMessages:    true,
                ManageMessages:  true,
                ManageChannels:  true,
                BanMembers:      true,
                KickMembers:     true,
                ModerateMembers: true,
                MuteMembers:     true,
                DeafenMembers:   true,
                MoveMembers:     true,
                MentionEveryone: true,
                ManageNicknames: true,
                ViewAuditLog:    true,
              }, `Preserving perms for ST/IC member via .off`).catch(() => {});
            }
          }
        }

      } catch (err) {
        failed.push(role?.name || roleId);
      }
    }

    await GuildConfig.updateOne({ guildId: message.guild.id }, { adminPermsEnabled: false });

    await logAction(message.guild, {
      action: 'Admin Perms OFF',
      moderator: message.author.id,
      target: null,
      reason: `Stripped ${rolesUpdated} roles, disabled ${botsDisabled} bots. ST/IC members immune.`,
      color: 0xED4245,
    });

    const failText = failed.length ? `\n⚠️ Failed on: ${failed.map(n => `\`${n}\``).join(', ')}` : '';
    return status.edit({
      embeds: [successEmbed(
        `All admin/mod permissions **stripped** from **${rolesUpdated}** roles.\n` +
        `**${botsDisabled}** bots in those tiers locked out.\n` +
        `🛡️ **ST** and **inner circle** members kept their permissions.` +
        failText
      )]
    });
  },
};
