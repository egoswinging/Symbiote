const { errorEmbed, successEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Safely serialize permission overwrites — never crashes
function serializeOverwrites(channel, guild) {
  try {
    if (!channel?.permissionOverwrites?.cache) return [];
    const result = [];
    for (const [, ow] of channel.permissionOverwrites.cache) {
      try {
        // Try to get a friendly name for the overwrite target
        let name = ow.id; // fallback to raw ID
        if (ow.type === 0) {
          // Role overwrite
          const role = guild.roles.cache.get(ow.id);
          if (role) name = role.name;
        } else {
          // Member overwrite — skip, we only restore role-based overwrites
          continue;
        }
        result.push({
          name,
          type:  ow.type,
          allow: ow.allow.bitfield.toString(),
          deny:  ow.deny.bitfield.toString(),
        });
      } catch { /* skip this overwrite */ }
    }
    return result;
  } catch {
    return [];
  }
}

// ── .saveserver <n> ────────────────────────────────────────────────────────
const saveserver = {
  name: 'saveserver',
  category: 'utility',
  description: 'Save the full server layout under a name (bot owner only)',
  usage: '.saveserver <n>',
  example: '.saveserver UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can save server layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide a name.\n**Usage:** `.saveserver <n>`\n**Example:** `.saveserver UBH`')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Saving **${name}**...` }]
    });

    try {
      const guild = message.guild;

      // Fetch everything fresh before reading cache
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // ── Roles ───────────────────────────────────────────────────────────────
      const rolesArr = [];
      for (const [, r] of guild.roles.cache) {
        try {
          if (r.id === guild.id) continue; // skip @everyone
          if (r.managed) continue;         // skip bot roles
          rolesArr.push({
            name:        r.name,
            color:       r.color,
            hoist:       r.hoist,
            position:    r.position,
            permissions: r.permissions.bitfield.toString(),
            mentionable: r.mentionable,
          });
        } catch { /* skip broken role */ }
      }
      rolesArr.sort((a, b) => a.position - b.position);

      // ── Channels ────────────────────────────────────────────────────────────
      const channelsArr = [];

      // Categories first
      const cats = [...guild.channels.cache.values()]
        .filter(c => c && c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const cat of cats) {
        try {
          channelsArr.push({
            name:                 cat.name,
            type:                 cat.type,
            position:             cat.position || 0,
            parentName:           null,
            topic:                null,
            nsfw:                 false,
            rateLimitPerUser:     0,
            bitrate:              null,
            userLimit:            null,
            permissionOverwrites: serializeOverwrites(cat, guild),
          });
        } catch { /* skip broken channel */ }
      }

      // Then all other channels
      const nonCats = [...guild.channels.cache.values()]
        .filter(c => c && c.type !== ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const ch of nonCats) {
        try {
          channelsArr.push({
            name:                 ch.name,
            type:                 ch.type,
            position:             ch.position || 0,
            parentName:           ch.parent?.name || null,
            topic:                ch.topic || null,
            nsfw:                 ch.nsfw || false,
            rateLimitPerUser:     ch.rateLimitPerUser || 0,
            bitrate:              ch.bitrate || null,
            userLimit:            ch.userLimit || null,
            permissionOverwrites: serializeOverwrites(ch, guild),
          });
        } catch { /* skip broken channel */ }
      }

      // ── Save to DB ──────────────────────────────────────────────────────────
      await Backup.findOneAndUpdate(
        { ownerId: message.author.id, name },
        {
          ownerId:   message.author.id,
          name,
          guildName: guild.name,
          guildId:   guild.id,
          savedAt:   new Date(),
          roles:     rolesArr,
          channels:  channelsArr,
        },
        { upsert: true, new: true }
      );

      return status.edit({
        embeds: [successEmbed(
          `✅ Saved **${name}**!\n` +
          `**${rolesArr.length}** roles · **${channelsArr.length}** channels\n\n` +
          `Use \`.ts\` to view all your saves.\n` +
          `Use \`.serverload ${name}\` to restore it in any server.`
        )]
      });

    } catch (err) {
      console.error('saveserver error:', err);
      return status.edit({ embeds: [errorEmbed(`Save failed: ${err.message}`)] });
    }
  },
};

// ── .serverload <n> ────────────────────────────────────────────────────────
const serverload = {
  name: 'serverload',
  category: 'utility',
  description: 'Wipe server and restore a saved layout (bot owner only)',
  usage: '.serverload <n>',
  example: '.serverload UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can load server layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide the backup name.\n**Usage:** `.serverload <n>`')] });

    const backup = await Backup.findOne({ ownerId: message.author.id, name });
    if (!backup)
      return message.reply({ embeds: [errorEmbed(`No backup named **${name}**. Use \`.ts\` to see saved layouts.`)] });

    const guild   = message.guild;
    const statusCh = message.channel;

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Loading **${name}**...\nDeleting existing channels and roles. Please wait.` }]
    });

    try {
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // ── Phase 1: Delete all channels (keep status channel) ────────────────
      for (const [, ch] of guild.channels.cache) {
        if (!ch || ch.id === statusCh.id) continue;
        await ch.delete('serverload').catch(() => {});
        await delay(400);
      }

      // ── Phase 2: Delete all editable roles ────────────────────────────────
      const myHighest = guild.members.me?.roles?.highest?.position || 999;
      const rolesToDel = [...guild.roles.cache.values()]
        .filter(r => r.id !== guild.id && !r.managed && r.position < myHighest)
        .sort((a, b) => a.position - b.position);

      for (const role of rolesToDel) {
        await role.delete('serverload').catch(() => {});
        await delay(400);
      }

      // ── Phase 3: Recreate roles (bottom → top) ────────────────────────────
      const roleMap = {}; // saved name → new role ID
      const sortedRoles = [...backup.roles].sort((a, b) => a.position - b.position);

      for (const r of sortedRoles) {
        try {
          const created = await guild.roles.create({
            name:        r.name,
            color:       r.color,
            hoist:       r.hoist,
            permissions: BigInt(r.permissions),
            mentionable: r.mentionable,
            reason:      `serverload: ${name}`,
          });
          roleMap[r.name] = created.id;
          await delay(400);
        } catch (err) {
          console.error(`Role failed [${r.name}]:`, err.message);
        }
      }

      // Helper — build overwrites array from saved data using roleMap
      function buildOverwrites(savedOws) {
        const result = [];
        for (const ow of savedOws || []) {
          try {
            const id = roleMap[ow.name];
            if (!id) continue;
            result.push({
              id,
              type:  0, // role only
              allow: BigInt(ow.allow),
              deny:  BigInt(ow.deny),
            });
          } catch {}
        }
        return result;
      }

      // ── Phase 4: Recreate categories ──────────────────────────────────────
      const catMap = {}; // saved name → new channel ID
      const cats = backup.channels
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

      for (const cat of cats) {
        try {
          const created = await guild.channels.create({
            name:                 cat.name,
            type:                 ChannelType.GuildCategory,
            position:             cat.position,
            permissionOverwrites: buildOverwrites(cat.permissionOverwrites),
            reason:               `serverload: ${name}`,
          });
          catMap[cat.name] = created.id;
          await delay(400);
        } catch (err) {
          console.error(`Category failed [${cat.name}]:`, err.message);
        }
      }

      // ── Phase 5: Recreate text/voice channels ─────────────────────────────
      const others = backup.channels
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

      for (const ch of others) {
        try {
          const opts = {
            name:                 ch.name,
            type:                 ch.type,
            position:             ch.position,
            permissionOverwrites: buildOverwrites(ch.permissionOverwrites),
            reason:               `serverload: ${name}`,
          };
          if (ch.parentName && catMap[ch.parentName]) opts.parent = catMap[ch.parentName];
          if (ch.topic)            opts.topic            = ch.topic;
          if (ch.nsfw)             opts.nsfw             = ch.nsfw;
          if (ch.rateLimitPerUser) opts.rateLimitPerUser = ch.rateLimitPerUser;
          if (ch.bitrate)          opts.bitrate          = ch.bitrate;
          if (ch.userLimit)        opts.userLimit        = ch.userLimit;

          await guild.channels.create(opts);
          await delay(400);
        } catch (err) {
          console.error(`Channel failed [${ch.name}]:`, err.message);
        }
      }

      // ── Phase 6: Delete status channel ────────────────────────────────────
      await statusCh.delete('serverload complete').catch(() => {});

    } catch (err) {
      console.error('serverload error:', err);
      await status.edit({ embeds: [errorEmbed(`Load failed: ${err.message}`)] }).catch(() => {});
    }
  },
};

// ── .ts ───────────────────────────────────────────────────────────────────────
const ts = {
  name: 'ts',
  category: 'utility',
  description: 'Show all your saved server layouts (bot owner only)',
  usage: '.ts',
  example: '.ts',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can view saved layouts.')] });

    const backups = await Backup.find({ ownerId: message.author.id }).sort({ savedAt: -1 });

    if (!backups.length)
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x2B2D31)
          .setDescription('No saved layouts yet.\nUse `.saveserver <n>` to save one.')]
      });

    const lines = backups.map((b, i) => {
      const date = new Date(b.savedAt).toLocaleDateString('en-GB');
      return `\`${i + 1}.\` **${b.name}**\n> 📁 *${b.guildName}* · ${b.roles.length} roles · ${b.channels.length} channels · ${date}`;
    });

    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`💾 Saved Layouts — ${backups.length}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: '.serverload <n> to restore  ·  .deletesave <n> to delete' })]
    });
  },
};

// ── .deletesave <n> ───────────────────────────────────────────────────────────
const deletesave = {
  name: 'deletesave',
  category: 'utility',
  description: 'Delete a saved server layout by name (bot owner only)',
  usage: '.deletesave <n>',
  example: '.deletesave UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can delete saved layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide the name.\n**Usage:** `.deletesave <n>`')] });

    const result = await Backup.deleteOne({ ownerId: message.author.id, name });
    if (!result.deletedCount)
      return message.reply({ embeds: [errorEmbed(`No backup named **${name}**. Use \`.ts\` to see your saves.`)] });

    return message.reply({ embeds: [successEmbed(`Deleted saved layout **${name}**.`)] });
  },
};

module.exports = [saveserver, serverload, ts, deletesave];
