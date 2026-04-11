const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

// ── ,saveserver ───────────────────────────────────────────────────────────────
const saveserver = {
  name: 'saveserver',
  category: 'utility',
  description: 'Save the ENTIRE server layout (channels + roles)',
  usage: '.saveserver',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can save the server.')] });

    const status = await message.reply({ embeds: [{ color: 0x5865F2, description: '⏳ Saving server layout...' }] });

    const guild = message.guild;
    await guild.channels.fetch();
    await guild.roles.fetch();

    // Serialize channels
    const channels = guild.channels.cache
      .filter(c => c.type !== ChannelType.GuildStageVoice)
      .map(c => ({
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parentId || null,
        topic: c.topic || null,
        nsfw: c.nsfw || false,
        rateLimitPerUser: c.rateLimitPerUser || 0,
        permissionOverwrites: c.permissionOverwrites?.cache.map(ow => ({
          id:    ow.id,
          type:  ow.type,
          allow: ow.allow.bitfield.toString(),
          deny:  ow.deny.bitfield.toString(),
        })) || [],
      }));

    // Serialize roles (exclude @everyone managed roles)
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map(r => ({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        position: r.position,
        permissions: r.permissions.bitfield.toString(),
        mentionable: r.mentionable,
      }));

    await Backup.findOneAndUpdate(
      { guildId: guild.id },
      { channels, roles, savedAt: new Date() },
      { upsert: true }
    );

    return status.edit({
      embeds: [successEmbed(`Server saved! **${channels.length}** channels, **${roles.length}** roles backed up.`)]
    });
  },
};

// ── ,serverload ───────────────────────────────────────────────────────────────
const serverload = {
  name: 'serverload',
  category: 'utility',
  description: 'Restore the server layout from backup',
  usage: '.serverload',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can restore the server.')] });

    const backup = await Backup.findOne({ guildId: message.guild.id });
    if (!backup)
      return message.reply({ embeds: [errorEmbed('No backup found. Use `.saveserver` first.')] });

    const status = await message.reply({ embeds: [{ color: 0x5865F2, description: '⏳ Restoring server layout... This may take a while.' }] });

    const guild = message.guild;

    try {
      // Restore roles (bottom to top)
      const sortedRoles = [...backup.roles].sort((a, b) => a.position - b.position);
      for (const r of sortedRoles) {
        const existing = guild.roles.cache.find(gr => gr.name === r.name);
        if (existing) {
          await existing.edit({
            color: r.color,
            hoist: r.hoist,
            permissions: BigInt(r.permissions),
            mentionable: r.mentionable,
          }).catch(() => {});
        } else {
          await guild.roles.create({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            permissions: BigInt(r.permissions),
            mentionable: r.mentionable,
            reason: 'Server restore',
          }).catch(() => {});
        }
        await new Promise(res => setTimeout(res, 300));
      }

      // Restore channels
      // First pass: categories
      const categories = backup.channels.filter(c => c.type === ChannelType.GuildCategory);
      const categoryMap = {}; // name → new id

      for (const cat of categories) {
        const existing = guild.channels.cache.find(c => c.name === cat.name && c.type === ChannelType.GuildCategory);
        if (existing) {
          categoryMap[cat.name] = existing.id;
        } else {
          const created = await guild.channels.create({
            name: cat.name,
            type: ChannelType.GuildCategory,
            position: cat.position,
            reason: 'Server restore',
          }).catch(() => null);
          if (created) categoryMap[cat.name] = created.id;
        }
        await new Promise(res => setTimeout(res, 300));
      }

      // Second pass: non-category channels
      const nonCats = backup.channels.filter(c => c.type !== ChannelType.GuildCategory);
      for (const ch of nonCats) {
        const existing = guild.channels.cache.find(c => c.name === ch.name && c.type === ch.type);
        const parent = ch.parentId ? (categoryMap[backup.channels.find(c => c.type === ChannelType.GuildCategory)?.name] || null) : null;

        if (!existing) {
          await guild.channels.create({
            name: ch.name,
            type: ch.type,
            parent: parent,
            position: ch.position,
            topic: ch.topic,
            nsfw: ch.nsfw,
            rateLimitPerUser: ch.rateLimitPerUser,
            reason: 'Server restore',
          }).catch(() => {});
          await new Promise(res => setTimeout(res, 300));
        }
      }

      return status.edit({ embeds: [successEmbed('Server layout restored from backup!')] });
    } catch (err) {
      return status.edit({ embeds: [errorEmbed(`Restore failed: ${err.message}`)] });
    }
  },
};

// ── ,resetsave ────────────────────────────────────────────────────────────────
const resetsave = {
  name: 'resetsave',
  category: 'utility',
  description: 'Delete the saved server backup',
  usage: '.resetsave',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can delete backups.')] });

    const result = await Backup.deleteOne({ guildId: message.guild.id });
    if (!result.deletedCount)
      return message.reply({ embeds: [errorEmbed('No backup found.')] });

    return message.reply({ embeds: [successEmbed('Server backup deleted.')] });
  },
};

module.exports = [saveserver, serverload, resetsave];
