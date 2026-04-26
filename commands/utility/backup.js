const { errorEmbed, successEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const SAVEABLE   = new Set([0, 2, 4, 5]);
const CREATEABLE = new Set([0, 2, 5]);

function safeStr(v)  { return (v !== null && v !== undefined) ? String(v) : null; }
function safeNum(v)  { const n = Number(v); return isNaN(n) ? 0 : n; }
function safeBool(v) { return Boolean(v); }

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
          roleId: String(role.id),   // save by ID for accuracy
          name:   String(role.name), // save name as fallback
          allow:  String(ow.allow?.bitfield ?? '0'),
          deny:   String(ow.deny?.bitfield  ?? '0'),
        });
      } catch {}
    }
  } catch {}
  return result;
}

// ── .saveserver ─────────────────────────────────────────────────────────────
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
      return message.reply({ embeds: [errorEmbed('Provide a name.\n**Usage:** `.saveserver <n>`')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Saving **${name}**...` }]
    });

    try {
      const guild = message.guild;
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});
      await guild.members.fetch().catch(() => {});

      // ── Roles — save id too so we can match on load ──────────────────────
      const roles = [];
      for (const [, r] of guild.roles.cache) {
        try {
          if (!r || r.id === guild.id) continue;
          roles.push({
            id:          String(r.id),
            name:        String(r.name),
            color:       safeNum(r.color),
            hoist:       safeBool(r.hoist),
            position:    safeNum(r.position),
            permissions: String(r.permissions?.bitfield ?? '0'),
            mentionable: safeBool(r.mentionable),
            managed:     safeBool(r.managed),
          });
        } catch (e) { console.warn(`[save] skip role ${r?.name}: ${e.message}`); }
      }
      roles.sort((a, b) => a.position - b.position);

      // ── Bots ─────────────────────────────────────────────────────────────
      const bots = [];
      for (const [, m] of guild.members.cache) {
        if (!m.user.bot) continue;
        bots.push({
          id:       m.user.id,
          username: m.user.username,
          tag:      m.user.tag,
        });
      }

      // ── Channels ─────────────────────────────────────────────────────────
      const channels = [];
      const allCh = [...guild.channels.cache.values()].filter(c => c && SAVEABLE.has(c.type));

      const cats = allCh.filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => safeNum(a.position) - safeNum(b.position));

      for (const cat of cats) {
        try {
          channels.push({
            name: String(cat.name), type: safeNum(cat.type),
            position: safeNum(cat.position), parentName: null,
            topic: null, nsfw: false, rateLimitPerUser: 0,
            bitrate: null, userLimit: null,
            permissionOverwrites: getOverwrites(cat, guild),
          });
        } catch (e) { console.warn(`[save] skip cat ${cat?.name}: ${e.message}`); }
      }

      const others = allCh.filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => safeNum(a.position) - safeNum(b.position));

      for (const ch of others) {
        try {
          channels.push({
            name: String(ch.name), type: safeNum(ch.type),
            position: safeNum(ch.position),
            parentName: safeStr(ch.parent?.name),
            topic: safeStr(ch.topic), nsfw: safeBool(ch.nsfw),
            rateLimitPerUser: safeNum(ch.rateLimitPerUser),
            bitrate: ch.bitrate ? safeNum(ch.bitrate) : null,
            userLimit: ch.userLimit ? safeNum(ch.userLimit) : null,
            permissionOverwrites: getOverwrites(ch, guild),
          });
        } catch (e) { console.warn(`[save] skip ch ${ch?.name}: ${e.message}`); }
      }

      await Backup.collection.findOneAndUpdate(
        { ownerId: message.author.id, name },
        { $set: { ownerId: message.author.id, name, guildName: String(guild.name), guildId: String(guild.id), savedAt: new Date(), roles, channels, bots } },
        { upsert: true }
      );

      console.log(`[saveserver] ✅ "${name}" — ${roles.length} roles, ${channels.length} channels, ${bots.length} bots`);

      return status.edit({
        embeds: [successEmbed(
          `✅ Saved **${name}**!\n\n` +
          `🎭 **${roles.length}** roles · 📁 **${channels.length}** channels · 🤖 **${bots.length}** bots\n\n` +
          `Use \`.ts\` to view all saves.\n` +
          `Use \`.serverload ${name}\` to restore in any server.`
        )]
      });

    } catch (err) {
      console.error('[saveserver] ERROR:', err.message);
      return status.edit({ embeds: [errorEmbed(`Save failed: ${err.message}`)] });
    }
  },
};

// ── .serverload ─────────────────────────────────────────────────────────────
const serverload = {
  name: 'serverload',
  category: 'utility',
  description: 'Wipe server and fully restore a saved layout (bot owner only)',
  usage: '.serverload <n>',
  example: '.serverload UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can load server layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide the backup name.\n**Usage:** `.serverload <n>`')] });

    const raw = await Backup.collection.findOne({ ownerId: message.author.id, name });
    if (!raw)
      return message.reply({ embeds: [errorEmbed(`No backup named **${name}**. Use \`.ts\` to see your saves.`)] });

    const guild    = message.guild;
    const statusCh = message.channel;
    await message.delete().catch(() => {});

    const status = await statusCh.send({
      embeds: [{ color: 0x5865F2, description: `⏳ Loading **${name}**...\nThis recreates all roles, permissions and channels exactly. Please wait.` }]
    });

    try {
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // ── Phase 1: Delete all channels (keep status channel) ────────────────
      console.log('[load] Phase 1: Delete channels');
      for (const [, ch] of guild.channels.cache) {
        if (!ch || ch.id === statusCh.id) continue;
        await ch.delete('serverload').catch(() => {});
        await delay(300);
      }

      // ── Phase 2: Delete all non-managed, editable roles ───────────────────
      console.log('[load] Phase 2: Delete roles');
      const myTop = guild.members.me?.roles?.highest?.position ?? 999;
      const toDelete = [...guild.roles.cache.values()]
        .filter(r => r && r.id !== guild.id && !r.managed && r.position < myTop)
        .sort((a, b) => a.position - b.position);
      for (const r of toDelete) {
        await r.delete('serverload').catch(() => {});
        await delay(300);
      }

      // ── Phase 3: Create roles (lowest position first) ─────────────────────
      // We create without position, then bulk-set positions after
      console.log(`[load] Phase 3: Create ${(raw.roles || []).length} roles`);

      // oldId → newId mapping (for potential future use)
      // name → newId mapping (for channel overwrites)
      const roleMapByName = {};
      const roleMapById   = {};

      const sortedRoles = (raw.roles || [])
        .filter(r => !r.managed)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      // Create roles one by one, lowest first
      const createdRoleList = []; // { savedPosition, role }
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
          roleMapByName[r.name] = created.id;
          if (r.id) roleMapById[r.id] = created.id;
          createdRoleList.push({ savedPosition: r.position, role: created });
          await delay(300);
        } catch (e) {
          console.warn(`[load] skip role [${r.name}]: ${e.message}`);
        }
      }

      // ── Phase 3b: Set role positions in bulk ──────────────────────────────
      // Discord setPositions takes array of { role, position }
      if (createdRoleList.length > 0) {
        try {
          // Sort by saved position and assign incremental positions
          const positionData = createdRoleList
            .sort((a, b) => a.savedPosition - b.savedPosition)
            .map((item, idx) => ({ role: item.role.id, position: idx + 1 }));

          await guild.roles.setPositions(positionData).catch(e => {
            console.warn('[load] setPositions failed:', e.message);
          });
          await delay(500);
        } catch (e) {
          console.warn('[load] bulk position failed:', e.message);
        }
      }

      // Helper to build Discord permission overwrites
      function buildOws(savedOws) {
        if (!Array.isArray(savedOws)) return [];
        const result = [];
        for (const ow of savedOws) {
          // Try to match by saved role ID first, then by name
          const newId = (ow.roleId && roleMapById[ow.roleId])
            || roleMapByName[ow.name];
          if (!newId) continue;
          try {
            result.push({
              id:    newId,
              type:  0,
              allow: BigInt(ow.allow || '0'),
              deny:  BigInt(ow.deny  || '0'),
            });
          } catch {}
        }
        return result;
      }

      // ── Phase 4: Create categories ────────────────────────────────────────
      console.log('[load] Phase 4: Create categories');
      const catMap = {}; // name → new channel id
      const cats = (raw.channels || [])
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i];
        try {
          const created = await guild.channels.create({
            name:                 cat.name,
            type:                 ChannelType.GuildCategory,
            permissionOverwrites: buildOws(cat.permissionOverwrites),
            reason:               `serverload: ${name}`,
          });
          catMap[cat.name] = created.id;
          // Set position after creation
          await created.setPosition(i).catch(() => {});
          await delay(300);
        } catch (e) {
          console.warn(`[load] skip cat [${cat.name}]: ${e.message}`);
        }
      }

      // ── Phase 5: Create text/voice channels ───────────────────────────────
      console.log('[load] Phase 5: Create channels');
      const others = (raw.channels || [])
        .filter(c => CREATEABLE.has(c.type))
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const ch of others) {
        try {
          const opts = {
            name:                 ch.name,
            type:                 ch.type,
            permissionOverwrites: buildOws(ch.permissionOverwrites),
            reason:               `serverload: ${name}`,
          };
          if (ch.parentName && catMap[ch.parentName]) opts.parent = catMap[ch.parentName];
          if (ch.topic)            opts.topic            = ch.topic;
          if (ch.nsfw)             opts.nsfw             = ch.nsfw;
          if (ch.rateLimitPerUser) opts.rateLimitPerUser = ch.rateLimitPerUser;
          if (ch.bitrate)          opts.bitrate          = ch.bitrate;
          if (ch.userLimit)        opts.userLimit        = ch.userLimit;

          const created = await guild.channels.create(opts);
          await created.setPosition(ch.position || 0).catch(() => {});
          await delay(300);
        } catch (e) {
          console.warn(`[load] skip ch [${ch.name}]: ${e.message}`);
        }
      }

      // ── Phase 6: Send bot list ─────────────────────────────────────────────
      if (raw.bots?.length) {
        await delay(1000);
        const anyText = guild.channels.cache.find(c =>
          c.type === ChannelType.GuildText &&
          c.permissionsFor(guild.members.me)?.has('SendMessages')
        );
        if (anyText) {
          const botLines = raw.bots.map((b, i) => `\`${i + 1}.\` **${b.username}** (\`${b.id}\`)`);
          await anyText.send({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle(`🤖 Bots from **${raw.guildName}** — ${raw.bots.length} bots`)
              .setDescription(botLines.join('\n'))
              .setFooter({ text: 'These bots were in the original server. Re-invite them manually if needed.' })
              .setTimestamp()]
          }).catch(() => {});
        }
      }

      console.log('[load] ✅ Complete');
      await statusCh.delete('serverload complete').catch(() => {});

    } catch (err) {
      console.error('[load] ERROR:', err.message);
      await status.edit({ embeds: [errorEmbed(`Load failed: ${err.message}`)] }).catch(() => {});
    }
  },
};

// ── .ts ─────────────────────────────────────────────────────────────────────
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
      const rc = Array.isArray(b.roles)    ? b.roles.length    : 0;
      const cc = Array.isArray(b.channels) ? b.channels.length : 0;
      const bc = Array.isArray(b.bots)     ? b.bots.length     : 0;
      return `\`${i + 1}.\` **${b.name}**\n> 📁 *${b.guildName}* · 🎭 ${rc} roles · 💬 ${cc} channels · 🤖 ${bc} bots · 📅 ${date}`;
    });

    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`💾 Saved Server Layouts — ${backups.length}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: '.serverload <n> to restore  ·  .deletesave <n> to delete' })]
    });
  },
};

// ── .deletesave ──────────────────────────────────────────────────────────────
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
