const { errorEmbed, successEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Channel types we can actually save and recreate
const SAVEABLE_TYPES = new Set([
  ChannelType.GuildText,         // 0
  ChannelType.GuildVoice,        // 2
  ChannelType.GuildCategory,     // 4
  ChannelType.GuildAnnouncement, // 5
  ChannelType.GuildStageVoice,   // 13
  ChannelType.GuildForum,        // 15
]);

// Channel types we can create (subset of saveable)
const CREATEABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
]);

// Safely get role-based permission overwrites from a channel
function getOverwrites(ch, guild) {
  try {
    if (!ch?.permissionOverwrites?.cache?.size) return [];
    const result = [];
    for (const [id, ow] of ch.permissionOverwrites.cache) {
      try {
        if (ow.type !== 0) continue; // role only, skip member overwrites
        const role = guild.roles.cache.get(id);
        if (!role) continue;
        result.push({
          name:  role.name,
          type:  0,
          allow: (ow.allow?.bitfield ?? 0n).toString(),
          deny:  (ow.deny?.bitfield  ?? 0n).toString(),
        });
      } catch {}
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
      await guild.channels.fetch();
      await guild.roles.fetch();

      // ── Roles ─────────────────────────────────────────────────────────────
      const rolesArr = [];
      for (const [, r] of guild.roles.cache) {
        if (!r || r.id === guild.id || r.managed) continue;
        try {
          rolesArr.push({
            name:        String(r.name),
            color:       Number(r.color) || 0,
            hoist:       Boolean(r.hoist),
            position:    Number(r.position) || 0,
            permissions: (r.permissions?.bitfield ?? 0n).toString(),
            mentionable: Boolean(r.mentionable),
          });
        } catch (e) {
          console.warn(`[saveserver] Skip role ${r?.name}: ${e.message}`);
        }
      }
      rolesArr.sort((a, b) => a.position - b.position);

      // ── Channels ──────────────────────────────────────────────────────────
      const channelsArr = [];
      const allCh = [...guild.channels.cache.values()];

      // Only save channel types we can actually recreate
      const toSave = allCh.filter(c => c && SAVEABLE_TYPES.has(c.type));

      // Categories first
      const cats = toSave
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const cat of cats) {
        try {
          channelsArr.push({
            name:                 String(cat.name),
            type:                 Number(cat.type),
            position:             Number(cat.position) || 0,
            parentName:           null,
            topic:                null,
            nsfw:                 false,
            rateLimitPerUser:     0,
            bitrate:              null,
            userLimit:            null,
            permissionOverwrites: getOverwrites(cat, guild),
          });
        } catch (e) {
          console.warn(`[saveserver] Skip category ${cat?.name}: ${e.message}`);
        }
      }

      // Non-category channels
      const others = toSave
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const ch of others) {
        try {
          channelsArr.push({
            name:                 String(ch.name),
            type:                 Number(ch.type),
            position:             Number(ch.position) || 0,
            parentName:           ch.parent?.name ? String(ch.parent.name) : null,
            topic:                ch.topic ? String(ch.topic) : null,
            nsfw:                 Boolean(ch.nsfw),
            rateLimitPerUser:     Number(ch.rateLimitPerUser) || 0,
            bitrate:              ch.bitrate ? Number(ch.bitrate) : null,
            userLimit:            ch.userLimit ? Number(ch.userLimit) : null,
            permissionOverwrites: getOverwrites(ch, guild),
          });
        } catch (e) {
          console.warn(`[saveserver] Skip channel ${ch?.name}: ${e.message}`);
        }
      }

      console.log(`[saveserver] Saving: ${rolesArr.length} roles, ${channelsArr.length} channels as "${name}"`);

      // ── Save to DB ─────────────────────────────────────────────────────────
      const saved = await Backup.findOneAndUpdate(
        { ownerId: message.author.id, name },
        {
          ownerId:   message.author.id,
          name:      name,
          guildName: guild.name,
          guildId:   guild.id,
          savedAt:   new Date(),
          roles:     rolesArr,
          channels:  channelsArr,
        },
        { upsert: true, new: true, runValidators: false }
      );

      console.log(`[saveserver] Success. ID: ${saved._id}`);

      return status.edit({
        embeds: [successEmbed(
          `✅ Saved **${name}**!\n` +
          `**${rolesArr.length}** roles · **${channelsArr.length}** channels\n\n` +
          `Use \`.ts\` to view all saves.\n` +
          `Use \`.serverload ${name}\` to restore in any server.`
        )]
      });

    } catch (err) {
      console.error('[saveserver] FATAL:', err.message, err.stack?.split('\n')[1]);
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
      return message.reply({ embeds: [errorEmbed(`No backup named **${name}**. Use \`.ts\` to see your saves.`)] });

    const guild    = message.guild;
    const statusCh = message.channel;
    await message.delete().catch(() => {});

    const status = await statusCh.send({
      embeds: [{ color: 0x5865F2, description: `⏳ Loading **${name}**...\nDeleting channels and roles — please wait.` }]
    });

    try {
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // ── Phase 1: Delete channels ──────────────────────────────────────────
      console.log('[serverload] Phase 1: Delete channels');
      for (const [, ch] of guild.channels.cache) {
        if (!ch || ch.id === statusCh.id) continue;
        await ch.delete('serverload').catch(() => {});
        await delay(350);
      }

      // ── Phase 2: Delete roles ─────────────────────────────────────────────
      console.log('[serverload] Phase 2: Delete roles');
      const myHighest = guild.members.me?.roles?.highest?.position ?? 999;
      const delRoles = [...guild.roles.cache.values()]
        .filter(r => r && r.id !== guild.id && !r.managed && r.position < myHighest)
        .sort((a, b) => a.position - b.position);
      for (const r of delRoles) {
        await r.delete('serverload').catch(() => {});
        await delay(350);
      }

      // ── Phase 3: Recreate roles ────────────────────────────────────────────
      console.log(`[serverload] Phase 3: Create ${backup.roles.length} roles`);
      const roleMap = {};
      const sortedRoles = [...backup.roles].sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const r of sortedRoles) {
        try {
          const created = await guild.roles.create({
            name:        r.name,
            color:       r.color || 0,
            hoist:       r.hoist || false,
            permissions: BigInt(r.permissions || '0'),
            mentionable: r.mentionable || false,
            reason:      `serverload: ${name}`,
          });
          roleMap[r.name] = created.id;
          await delay(350);
        } catch (e) {
          console.warn(`[serverload] Role skip [${r.name}]: ${e.message}`);
        }
      }

      function buildOverwrites(savedOws) {
        if (!savedOws?.length) return [];
        return savedOws.map(ow => {
          const id = roleMap[ow.name];
          if (!id) return null;
          try {
            return { id, type: 0, allow: BigInt(ow.allow || '0'), deny: BigInt(ow.deny || '0') };
          } catch { return null; }
        }).filter(Boolean);
      }

      // ── Phase 4: Recreate categories ──────────────────────────────────────
      console.log('[serverload] Phase 4: Create categories');
      const catMap = {};
      const cats = backup.channels
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const cat of cats) {
        try {
          const created = await guild.channels.create({
            name:                 cat.name,
            type:                 ChannelType.GuildCategory,
            position:             cat.position || 0,
            permissionOverwrites: buildOverwrites(cat.permissionOverwrites),
            reason:               `serverload: ${name}`,
          });
          catMap[cat.name] = created.id;
          await delay(350);
        } catch (e) {
          console.warn(`[serverload] Category skip [${cat.name}]: ${e.message}`);
        }
      }

      // ── Phase 5: Recreate channels (only createable types) ────────────────
      console.log('[serverload] Phase 5: Create channels');
      const others = backup.channels
        .filter(c => CREATEABLE_TYPES.has(c.type) && c.type !== ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const ch of others) {
        try {
          const opts = {
            name:                 ch.name,
            type:                 ch.type,
            position:             ch.position || 0,
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
          await delay(350);
        } catch (e) {
          console.warn(`[serverload] Channel skip [${ch.name}]: ${e.message}`);
        }
      }

      console.log('[serverload] Complete');
      await statusCh.delete('serverload complete').catch(() => {});

    } catch (err) {
      console.error('[serverload] FATAL:', err.message);
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
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No saved layouts yet.\nUse `.saveserver <n>` to save one.')] });
    const lines = backups.map((b, i) => {
      const date = new Date(b.savedAt).toLocaleDateString('en-GB');
      return `\`${i + 1}.\` **${b.name}**\n> 📁 *${b.guildName}* · ${b.roles.length} roles · ${b.channels.length} channels · ${date}`;
    });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`💾 Saved Layouts — ${backups.length}`).setDescription(lines.join('\n\n')).setFooter({ text: '.serverload <n> to restore  ·  .deletesave <n> to delete' })] });
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
