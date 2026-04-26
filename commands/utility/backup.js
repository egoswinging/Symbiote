const { errorEmbed, successEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Only save+recreate these channel types — everything else is skipped
const SAVEABLE = new Set([0, 2, 4, 5]); // GuildText, GuildVoice, GuildCategory, GuildAnnouncement
const CREATEABLE = new Set([0, 2, 5]);  // Can create these (not category, handled separately)

function safeString(v) { return (v !== undefined && v !== null) ? String(v) : null; }
function safeNumber(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function safeBool(v)   { return Boolean(v); }

// Get role-based permission overwrites safely
function getOverwrites(ch, guild) {
  const result = [];
  try {
    if (!ch?.permissionOverwrites?.cache) return result;
    for (const [id, ow] of ch.permissionOverwrites.cache) {
      try {
        if (ow.type !== 0) continue;
        const role = guild.roles.cache.get(id);
        if (!role) continue;
        result.push({
          name:  String(role.name),
          allow: String(ow.allow?.bitfield ?? '0'),
          deny:  String(ow.deny?.bitfield  ?? '0'),
        });
      } catch {}
    }
  } catch {}
  return result;
}

// ── .saveserver ────────────────────────────────────────────────────────────
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

      // Force fresh fetch
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // ── Build roles array ────────────────────────────────────────────────
      const roles = [];
      for (const [, r] of guild.roles.cache) {
        try {
          if (!r || r.id === guild.id || r.managed) continue;
          roles.push({
            name:        String(r.name),
            color:       safeNumber(r.color),
            hoist:       safeBool(r.hoist),
            position:    safeNumber(r.position),
            permissions: String(r.permissions?.bitfield ?? '0'),
            mentionable: safeBool(r.mentionable),
          });
        } catch (e) {
          console.warn(`[save] skip role: ${e.message}`);
        }
      }
      roles.sort((a, b) => a.position - b.position);

      // ── Build channels array ─────────────────────────────────────────────
      const channels = [];
      const allCh = [...guild.channels.cache.values()].filter(c => c && SAVEABLE.has(c.type));

      // Categories first
      const cats = allCh.filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => safeNumber(a.position) - safeNumber(b.position));

      for (const cat of cats) {
        try {
          channels.push({
            name:     String(cat.name),
            type:     safeNumber(cat.type),
            position: safeNumber(cat.position),
            parentName: null,
            topic: null, nsfw: false, rateLimitPerUser: 0,
            bitrate: null, userLimit: null,
            permissionOverwrites: getOverwrites(cat, guild),
          });
        } catch (e) {
          console.warn(`[save] skip cat ${cat?.name}: ${e.message}`);
        }
      }

      // Other channels
      const others = allCh.filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => safeNumber(a.position) - safeNumber(b.position));

      for (const ch of others) {
        try {
          channels.push({
            name:             String(ch.name),
            type:             safeNumber(ch.type),
            position:         safeNumber(ch.position),
            parentName:       safeString(ch.parent?.name),
            topic:            safeString(ch.topic),
            nsfw:             safeBool(ch.nsfw),
            rateLimitPerUser: safeNumber(ch.rateLimitPerUser),
            bitrate:          ch.bitrate ? safeNumber(ch.bitrate) : null,
            userLimit:        ch.userLimit ? safeNumber(ch.userLimit) : null,
            permissionOverwrites: getOverwrites(ch, guild),
          });
        } catch (e) {
          console.warn(`[save] skip ch ${ch?.name}: ${e.message}`);
        }
      }

      console.log(`[saveserver] ${roles.length} roles, ${channels.length} channels → "${name}"`);

      // ── Write to DB using native MongoDB driver (bypasses Mongoose validation entirely) ──
      const collection = Backup.collection;
      await collection.findOneAndUpdate(
        { ownerId: message.author.id, name },
        {
          $set: {
            ownerId:   message.author.id,
            name,
            guildName: String(guild.name),
            guildId:   String(guild.id),
            savedAt:   new Date(),
            roles,
            channels,
          }
        },
        { upsert: true }
      );

      console.log(`[saveserver] Saved successfully`);

      return status.edit({
        embeds: [successEmbed(
          `✅ Saved **${name}**!\n` +
          `**${roles.length}** roles · **${channels.length}** channels\n\n` +
          `\`.ts\` to view all · \`.serverload ${name}\` to restore`
        )]
      });

    } catch (err) {
      console.error('[saveserver] ERROR:', err.message);
      console.error(err.stack?.split('\n').slice(0,3).join('\n'));
      return status.edit({ embeds: [errorEmbed(`Save failed: ${err.message}`)] });
    }
  },
};

// ── .serverload ────────────────────────────────────────────────────────────
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

    // Load from native driver too
    const raw = await Backup.collection.findOne({ ownerId: message.author.id, name });
    if (!raw)
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

      // Phase 1: Delete channels
      for (const [, ch] of guild.channels.cache) {
        if (!ch || ch.id === statusCh.id) continue;
        await ch.delete('serverload').catch(() => {});
        await delay(350);
      }

      // Phase 2: Delete roles
      const myTop = guild.members.me?.roles?.highest?.position ?? 999;
      const delRoles = [...guild.roles.cache.values()]
        .filter(r => r && r.id !== guild.id && !r.managed && r.position < myTop)
        .sort((a, b) => a.position - b.position);
      for (const r of delRoles) {
        await r.delete('serverload').catch(() => {});
        await delay(350);
      }

      // Phase 3: Create roles
      const roleMap = {};
      const sortedRoles = (raw.roles || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const r of sortedRoles) {
        try {
          const created = await guild.roles.create({
            name:        r.name || 'Role',
            color:       r.color || 0,
            hoist:       r.hoist || false,
            permissions: BigInt(r.permissions || '0'),
            mentionable: r.mentionable || false,
            reason:      `serverload: ${name}`,
          });
          roleMap[r.name] = created.id;
          await delay(350);
        } catch (e) {
          console.warn(`[load] skip role [${r.name}]: ${e.message}`);
        }
      }

      function buildOws(savedOws) {
        if (!Array.isArray(savedOws)) return [];
        return savedOws.map(ow => {
          const id = roleMap[ow.name];
          if (!id) return null;
          try { return { id, type: 0, allow: BigInt(ow.allow || '0'), deny: BigInt(ow.deny || '0') }; }
          catch { return null; }
        }).filter(Boolean);
      }

      // Phase 4: Create categories
      const catMap = {};
      const cats = (raw.channels || []).filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const cat of cats) {
        try {
          const created = await guild.channels.create({
            name: cat.name, type: ChannelType.GuildCategory,
            position: cat.position || 0,
            permissionOverwrites: buildOws(cat.permissionOverwrites),
            reason: `serverload: ${name}`,
          });
          catMap[cat.name] = created.id;
          await delay(350);
        } catch (e) {
          console.warn(`[load] skip cat [${cat.name}]: ${e.message}`);
        }
      }

      // Phase 5: Create channels
      const others = (raw.channels || [])
        .filter(c => CREATEABLE.has(c.type))
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const ch of others) {
        try {
          const opts = {
            name: ch.name, type: ch.type,
            position: ch.position || 0,
            permissionOverwrites: buildOws(ch.permissionOverwrites),
            reason: `serverload: ${name}`,
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
          console.warn(`[load] skip ch [${ch.name}]: ${e.message}`);
        }
      }

      await statusCh.delete('serverload complete').catch(() => {});

    } catch (err) {
      console.error('[serverload] ERROR:', err.message);
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
    const backups = await Backup.collection.find({ ownerId: message.author.id }).sort({ savedAt: -1 }).toArray();
    if (!backups.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No saved layouts yet.\nUse `.saveserver <n>` to save one.')] });
    const lines = backups.map((b, i) => {
      const date = new Date(b.savedAt).toLocaleDateString('en-GB');
      const rc = Array.isArray(b.roles) ? b.roles.length : 0;
      const cc = Array.isArray(b.channels) ? b.channels.length : 0;
      return `\`${i + 1}.\` **${b.name}**\n> 📁 *${b.guildName}* · ${rc} roles · ${cc} channels · ${date}`;
    });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`💾 Saved Layouts — ${backups.length}`).setDescription(lines.join('\n\n')).setFooter({ text: '.serverload <n> to restore  ·  .deletesave <n> to delete' })] });
  },
};

// ── .deletesave ───────────────────────────────────────────────────────────────
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
    const result = await Backup.collection.deleteOne({ ownerId: message.author.id, name });
    if (!result.deletedCount)
      return message.reply({ embeds: [errorEmbed(`No backup named **${name}**. Use \`.ts\` to see your saves.`)] });
    return message.reply({ embeds: [successEmbed(`Deleted saved layout **${name}**.`)] });
  },
};

module.exports = [saveserver, serverload, ts, deletesave];
