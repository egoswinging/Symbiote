const { errorEmbed, successEmbed, paginate } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

// ── .saveserver <name> ────────────────────────────────────────────────────────
const saveserver = {
  name: 'saveserver',
  category: 'utility',
  description: 'Save the full server layout under a name (bot owner only)',
  usage: '.saveserver <name>',
  example: '.saveserver UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can save server layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide a name.\n**Usage:** `.saveserver <name>`\n**Example:** `.saveserver UBH`')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Saving server layout as **${name}**...` }]
    });

    const guild = message.guild;
    await guild.channels.fetch();
    await guild.roles.fetch();

    // ── Save roles (skip @everyone and managed bot roles) ─────────────────────
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed)
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        name:        r.name,
        color:       r.color,
        hoist:       r.hoist,
        position:    r.position,
        permissions: r.permissions.bitfield.toString(),
        mentionable: r.mentionable,
      }));

    // ── Save channels ─────────────────────────────────────────────────────────
    const channels = [];

    // Categories first
    const categories = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const [, cat] of categories) {
      channels.push({
        name:     cat.name,
        type:     cat.type,
        position: cat.position,
        parentName: null,
        permissionOverwrites: cat.permissionOverwrites.cache.map(ow => {
          const target = guild.roles.cache.get(ow.id) || guild.members.cache.get(ow.id);
          return {
            name:  target?.name || target?.user?.tag || ow.id,
            type:  ow.type,
            allow: ow.allow.bitfield.toString(),
            deny:  ow.deny.bitfield.toString(),
          };
        }),
      });
    }

    // Then all other channels
    const nonCats = guild.channels.cache
      .filter(c => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const [, ch] of nonCats) {
      const parent = ch.parent ? guild.channels.cache.get(ch.parentId) : null;
      channels.push({
        name:             ch.name,
        type:             ch.type,
        position:         ch.position,
        parentName:       parent?.name || null,
        topic:            ch.topic || null,
        nsfw:             ch.nsfw || false,
        rateLimitPerUser: ch.rateLimitPerUser || 0,
        bitrate:          ch.bitrate || null,
        userLimit:        ch.userLimit || null,
        permissionOverwrites: ch.permissionOverwrites?.cache.map(ow => {
          const target = guild.roles.cache.get(ow.id) || guild.members.cache.get(ow.id);
          return {
            name:  target?.name || target?.user?.tag || ow.id,
            type:  ow.type,
            allow: ow.allow.bitfield.toString(),
            deny:  ow.deny.bitfield.toString(),
          };
        }) || [],
      });
    }

    // ── Save to DB (upsert by ownerId + name) ─────────────────────────────────
    await Backup.findOneAndUpdate(
      { ownerId: message.author.id, name },
      {
        ownerId:   message.author.id,
        name,
        guildName: guild.name,
        guildId:   guild.id,
        savedAt:   new Date(),
        roles,
        channels,
      },
      { upsert: true, new: true }
    );

    return status.edit({
      embeds: [successEmbed(
        `Server layout saved as **${name}**!\n` +
        `**${roles.length}** roles · **${channels.length}** channels\n` +
        `This backup is yours globally — load it in any server.`
      )]
    });
  },
};

// ── .serverload <name> ────────────────────────────────────────────────────────
const serverload = {
  name: 'serverload',
  category: 'utility',
  description: 'Delete all channels/roles and restore a saved layout (bot owner only)',
  usage: '.serverload <name>',
  example: '.serverload UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can load server layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide the backup name.\n**Usage:** `.serverload <name>`')] });

    const backup = await Backup.findOne({ ownerId: message.author.id, name });
    if (!backup)
      return message.reply({ embeds: [errorEmbed(`No backup found with the name **${name}**. Use \`.ts\` to see your saved layouts.`)] });

    const guild = message.guild;
    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Loading layout **${name}** — this will delete all existing channels and roles...` }]
    });

    // ── PHASE 1: Delete all existing channels ─────────────────────────────────
    await guild.channels.fetch();
    for (const [, ch] of guild.channels.cache) {
      if (ch.id === status.channel.id) continue; // keep status channel till end
      await ch.delete('Server load — clearing layout').catch(() => {});
      await new Promise(r => setTimeout(r, 300));
    }

    // ── PHASE 2: Delete all existing roles (except @everyone and managed) ─────
    await guild.roles.fetch();
    const rolesToDelete = guild.roles.cache.filter(r =>
      r.id !== guild.id &&
      !r.managed &&
      r.position < guild.members.me.roles.highest.position
    ).sort((a, b) => a.position - b.position);

    for (const [, role] of rolesToDelete) {
      await role.delete('Server load — clearing roles').catch(() => {});
      await new Promise(r => setTimeout(r, 300));
    }

    // ── PHASE 3: Recreate roles (bottom to top) ───────────────────────────────
    const roleNameToId = {}; // map saved name → new role ID for permission overwrites

    const sortedRoles = [...backup.roles].sort((a, b) => a.position - b.position);
    for (const r of sortedRoles) {
      try {
        const newRole = await guild.roles.create({
          name:        r.name,
          color:       r.color,
          hoist:       r.hoist,
          permissions: BigInt(r.permissions),
          mentionable: r.mentionable,
          reason:      `Server load: ${name}`,
        });
        roleNameToId[r.name] = newRole.id;
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`Failed to create role ${r.name}:`, err.message);
      }
    }

    // ── PHASE 4: Recreate categories ──────────────────────────────────────────
    const categoryNameToId = {};
    const categoryChannels = backup.channels.filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const cat of categoryChannels) {
      try {
        const overwrites = buildOverwrites(cat.permissionOverwrites, roleNameToId, guild);
        const newCat = await guild.channels.create({
          name:                cat.name,
          type:                ChannelType.GuildCategory,
          position:            cat.position,
          permissionOverwrites: overwrites,
          reason:              `Server load: ${name}`,
        });
        categoryNameToId[cat.name] = newCat.id;
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`Failed to create category ${cat.name}:`, err.message);
      }
    }

    // ── PHASE 5: Recreate text/voice channels ─────────────────────────────────
    const nonCatChannels = backup.channels.filter(c => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const ch of nonCatChannels) {
      try {
        const overwrites = buildOverwrites(ch.permissionOverwrites, roleNameToId, guild);
        const createOptions = {
          name:                ch.name,
          type:                ch.type,
          position:            ch.position,
          permissionOverwrites: overwrites,
          reason:              `Server load: ${name}`,
        };

        if (ch.parentName && categoryNameToId[ch.parentName]) {
          createOptions.parent = categoryNameToId[ch.parentName];
        }
        if (ch.topic)            createOptions.topic = ch.topic;
        if (ch.nsfw)             createOptions.nsfw = ch.nsfw;
        if (ch.rateLimitPerUser) createOptions.rateLimitPerUser = ch.rateLimitPerUser;
        if (ch.bitrate)          createOptions.bitrate = ch.bitrate;
        if (ch.userLimit)        createOptions.userLimit = ch.userLimit;

        await guild.channels.create(createOptions);
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`Failed to create channel ${ch.name}:`, err.message);
      }
    }

    // ── PHASE 6: Delete the status channel last ───────────────────────────────
    await status.channel.delete('Server load complete').catch(() => {});
  },
};

// Helper — convert saved overwrite names back to IDs
function buildOverwrites(savedOverwrites, roleNameToId, guild) {
  return savedOverwrites.map(ow => {
    // Try to find the role by name in newly created roles
    const roleId = roleNameToId[ow.name];
    if (!roleId) return null;
    return {
      id:    roleId,
      type:  ow.type,
      allow: BigInt(ow.allow),
      deny:  BigInt(ow.deny),
    };
  }).filter(Boolean);
}

// ── .ts — list all saved templates ───────────────────────────────────────────
const ts = {
  name: 'ts',
  category: 'utility',
  description: 'Show all your saved server layouts/templates (bot owner only)',
  usage: '.ts',
  example: '.ts',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can view saved layouts.')] });

    const backups = await Backup.find({ ownerId: message.author.id }).sort({ savedAt: -1 });

    if (!backups.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No saved server layouts. Use `.saveserver <name>` to save one.')] });

    const lines = backups.map((b, i) => {
      const date = new Date(b.savedAt).toLocaleDateString();
      return `\`${i + 1}.\` **${b.name}** — saved from *${b.guildName}* on ${date}\n> ${b.roles.length} roles · ${b.channels.length} channels`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`💾 Saved Server Layouts — ${backups.length}`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: 'Use .serverload <name> to restore • .deletesave <name> to delete' });

    return message.reply({ embeds: [embed] });
  },
};

// ── .deletesave <name> ────────────────────────────────────────────────────────
const deletesave = {
  name: 'deletesave',
  category: 'utility',
  description: 'Delete a saved server layout by name (bot owner only)',
  usage: '.deletesave <name>',
  example: '.deletesave UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can delete saved layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide the backup name.\n**Usage:** `.deletesave <name>`')] });

    const result = await Backup.deleteOne({ ownerId: message.author.id, name });
    if (!result.deletedCount)
      return message.reply({ embeds: [errorEmbed(`No backup found with name **${name}**.`)] });

    return message.reply({ embeds: [successEmbed(`Deleted saved layout **${name}**.`)] });
  },
};

module.exports = [saveserver, serverload, ts, deletesave];
