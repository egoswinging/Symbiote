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

    const protectedUsers = await UserData.find({
      guildId: message.guild.id,
      $or: [{ isSecret: true }, { isInnerCircle: true }],
    }).lean();
    const protectedIds = new Set(protectedUsers.map(u => u.userId));
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    for (const id of ownerIds) protectedIds.add(id);

    await message.guild.members.fetch();

    let rolesUpdated = 0;
    let botsDisabled = 0;
    const failed = [];
    const snapshot = {};

    for (const roleId of allRoleIds) {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) continue;

      try {
        // Save this role's unique permissions
        snapshot[roleId] = role.permissions.bitfield.toString();

        // Strip to zero
        await role.setPermissions(BigInt(0), `Admin perms OFF by ${message.author.tag}`);
        rolesUpdated++;

        // Lock bots that have this role
        const botsWithRole = message.guild.members.cache.filter(m =>
          m.user.bot && m.roles.cache.has(roleId)
        );
        for (const [, botMember] of botsWithRole) {
          if (protectedIds.has(botMember.id)) continue;
          const botManagedRole = botMember.roles.cache.find(r => r.managed && r.id !== message.guild.id);
          if (!botManagedRole) continue;
          const channels = message.guild.channels.cache.filter(c => c.type !== 4);
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(botManagedRole, {
              SendMessages: false, ManageMessages: false, ManageChannels: false,
              ManageRoles: false, BanMembers: false, KickMembers: false,
              ModerateMembers: false, MuteMembers: false, DeafenMembers: false,
              MoveMembers: false, ManageWebhooks: false, MentionEveryone: false,
              ViewAuditLog: false, ManageNicknames: false, Administrator: false,
            }, `Bot locked via .off`).catch(() => {});
          }
          botsDisabled++;
        }

        // Protect ST/IC members
        const protectedInRole = message.guild.members.cache.filter(m =>
          !m.user.bot && m.roles.cache.has(roleId) && protectedIds.has(m.id)
        );
        for (const [, member] of protectedInRole) {
          const channels = message.guild.channels.cache.filter(c => c.type !== 4);
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(member, {
              SendMessages: true, ManageMessages: true, ManageChannels: true,
              BanMembers: true, KickMembers: true, ModerateMembers: true,
              MuteMembers: true, DeafenMembers: true, MoveMembers: true,
              MentionEveryone: true, ManageNicknames: true, ViewAuditLog: true,
              ManageRoles: true, Administrator: true,
            }, `Preserving perms for ST/IC via .off`).catch(() => {});
          }
        }

      } catch (err) {
        failed.push(role?.name || roleId);
      }
    }

    // Use direct MongoDB update with $set to guarantee it saves
    const snapshotStr = JSON.stringify(snapshot);
    await GuildConfig.collection.updateOne(
      { guildId: message.guild.id },
      { $set: { adminPermsEnabled: false, savedRolePerms: snapshotStr } }
    );

    // Verify it saved
    const verify = await GuildConfig.findOne({ guildId: message.guild.id }).lean();
    console.log('Verified saved snapshot:', verify?.savedRolePerms);

    await logAction(message.guild, {
      action: 'Admin Perms OFF',
      moderator: message.author.id,
      target: null,
      reason: `Stripped ${rolesUpdated} roles`,
      color: 0xED4245,
    });

    const failText = failed.length ? `\n⚠️ Failed (above bot or managed): ${failed.map(n => `\`${n}\``).join(', ')}` : '';
    return status.edit({
      embeds: [successEmbed(
        `Permissions **stripped** from **${rolesUpdated}** roles.\n` +
        `**${botsDisabled}** bots locked out.\n` +
        `✅ Snapshot saved — use \`.on\` to restore each role individually.` +
        failText
      )]
    });
  },
};
