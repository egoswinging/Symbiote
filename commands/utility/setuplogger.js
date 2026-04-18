const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const GuildConfig = require('../../models/GuildConfig');
const { ChannelType, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'setuplogger',
  category: 'utility',
  description: 'Create two log channels: mod-logs and dele-edit',
  usage: '.setuplogger',
  example: '.setuplogger',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can setup logging.')] });

    const status = await message.reply({ embeds: [{ color: 0x5865F2, description: '⏳ Setting up log channels...' }] });

    // Permission overwrites — hidden from everyone, bot can see and send
    const overwrites = [
      {
        id:   message.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id:    client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },
    ];

    // ── Create or reuse a Logs category ──────────────────────────────────────
    let category = message.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'logs'
    );

    if (!category) {
      category = await message.guild.channels.create({
        name: 'Logs',
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites,
        reason: `Logger setup by ${message.author.tag}`,
      });
    }

    // ── Channel 1: mod-logs ───────────────────────────────────────────────────
    // Commands used, bans, kicks, timeouts, anti-nuke, vanish, etc.
    let modLogsChannel = config.logChannel
      ? message.guild.channels.cache.get(config.logChannel)
      : null;

    if (!modLogsChannel) {
      modLogsChannel = await message.guild.channels.create({
        name: 'mod-logs',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: 'Moderation actions, commands used, and other bot actions',
        permissionOverwrites: overwrites,
        reason: `Logger setup by ${message.author.tag}`,
      });
    }

    // ── Channel 2: dele-edit ──────────────────────────────────────────────────
    // Deleted and edited messages only
    let deleteEditChannel = config.deleteEditChannel
      ? message.guild.channels.cache.get(config.deleteEditChannel)
      : null;

    if (!deleteEditChannel) {
      deleteEditChannel = await message.guild.channels.create({
        name: 'dele-edit',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: 'Deleted and edited messages',
        permissionOverwrites: overwrites,
        reason: `Logger setup by ${message.author.tag}`,
      });
    }

    // Save both channel IDs
    await GuildConfig.updateOne(
      { guildId: message.guild.id },
      {
        logChannel:        modLogsChannel.id,
        deleteEditChannel: deleteEditChannel.id,
      }
    );

    return status.edit({
      embeds: [successEmbed(
        `✅ Log channels set up!\n\n` +
        `📋 **${modLogsChannel}** — mod actions, commands used, bans, kicks, timeouts\n` +
        `🗑️ **${deleteEditChannel}** — deleted and edited messages`
      )]
    });
  },
};
