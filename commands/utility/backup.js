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
        // Include @everyone (role.id === guild.id) AND all other roles
        const name = role ? (role.id === guild.id ? '@everyone' : role.name) : null;
        if (!name) continue;
        result.push({
          roleId:    String(id),
          name,
          isEveryone: role.id === guild.id,
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

      // Roles — sorted highest position first (how they appear in Discord UI)
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
      // Save sorted by position DESCENDING (highest first = top of list)
      roles.sort((a, b) => b.position - a.position);

      const bots = [];
      for (const [, m] of guild.members.cache) {
        if (!m.user.bot) continue;
        bots.push({ id: m.user.id, username: m.user.username, tag: m.user.tag });
      }

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

      console.log(`[saveserver] Saved "${name}": ${roles.length} roles, ${channels.length} channels, ${bots.length} bots`);

      return status.edit({
        embeds: [successEmbed(
          `✅ Saved **${name}**!\n\n` +
          `🎭 **${roles.length}** roles · 📁 **${channels.length}** channels · 🤖 **${bots.length}** bots\n\n` +
          `Use \`.ts\` to view saves · \`.serverload ${name}\` to restore`
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
  description: 'Wipe server and restore a saved layout (bot owner only)',
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
      embeds: [{ color: 0x5865F2, description: `⏳ Loading **${name}**... please wait.` }]
    });

    try {
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // Phase 1: Delete channels
      console.log('[load] Phase 1: Delete channels');
      for (const [, ch] of guild.channels.cache) {
        if (!ch || ch.id === statusCh.id) continue;
        await ch.delete('serverload').catch(() => {});
        await delay(300);
      }

      // Phase 2: Delete roles
      console.log('[load] Phase 2: Delete roles');
      const myTop = guild.members.me?.roles?.highest?.position ?? 999;
      const toDelete = [...guild.roles.cache.values()]
        .filter(r => r && r.id !== guild.id && !r.managed && r.position < myTop)
        .sort((a, b) => a.position - b.position);
      for (const r of toDelete) {
        await r.delete('serverload').catch(() => {});
        await delay(300);
      }

      // Phase 3: Create roles
      // Saved as highest first. We need to create LOWEST first so Discord
      // stacks them correctly, then use setPositions to fix the order.
      console.log('[load] Phase 3: Create roles');

      const roleMapByName = {};
      const roleMapById   = {};

      // Roles saved as highest-position-first (top of Discord list = first in array)
      // We need to restore them in the EXACT same hierarchy
      // Strategy: create all roles first (they'll stack randomly),
      // then use setPositions with explicit position values to fix order
      const savedRoles = (raw.roles || []).filter(r => !r.managed);

      // Sort ascending by position (lowest first = bottom of list)
      const ascendingRoles = [...savedRoles].sort((a, b) => (a.position || 0) - (b.position || 0));

      const createdPairs = []; // { originalPosition, newId }

      // Create all roles first
      for (const r of ascendingRoles) {
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
          createdPairs.push({ originalPosition: r.position || 0, newId: created.id });
          await delay(400);
        } catch (e) {
          console.warn(`[load] skip role [${r.name}]: ${e.message}`);
        }
      }

      // Now fix positions using setPositions
      // Sort by originalPosition ascending, assign positions 1..N
      // Position 1 = just above @everyone (bottom), N = top
      if (createdPairs.length > 0) {
        try {
          // Use original saved position values directly
          // Discord API accepts absolute position numbers
          const positionData = createdPairs.map(p => ({
            role:     p.newId,
            position: p.originalPosition,
          }));
          // Sort so highest positions are applied last (avoids conflicts)
          positionData.sort((a, b) => a.position - b.position);
          await guild.roles.setPositions(positionData);
          await delay(1000);
          console.log(`[load] setPositions done for ${positionData.length} roles`);
        } catch (e) {
          console.warn('[load] setPositions warn:', e.message);
          // Fallback: set each role position individually
          try {
            const sorted = [...createdPairs].sort((a, b) => a.originalPosition - b.originalPosition);
            for (let i = 0; i < sorted.length; i++) {
              const role = guild.roles.cache.get(sorted[i].newId);
              if (role) await role.setPosition(i + 1, { relative: false }).catch(() => {});
              await delay(200);
            }
          } catch {}
        }
      }

      function buildOws(savedOws) {
        if (!Array.isArray(savedOws)) return [];
        return savedOws.map(ow => {
          const newId = (ow.roleId && roleMapById[ow.roleId]) || roleMapByName[ow.name];
          if (!newId) return null;
          try {
            return { id: newId, type: 0, allow: BigInt(ow.allow || '0'), deny: BigInt(ow.deny || '0') };
          } catch { return null; }
        }).filter(Boolean);
      }

      // Phase 4: Create categories
      console.log('[load] Phase 4: Create categories');
      const catMap = {};
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
          await created.setPosition(i).catch(() => {});
          await delay(300);
        } catch (e) {
          console.warn(`[load] skip cat [${cat.name}]: ${e.message}`);
        }
      }

      // Phase 5: Create channels
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

      // Phase 6: Bot list
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
              .setFooter({ text: 'Re-invite these bots manually if needed.' })
              .setTimestamp()]
          }).catch(() => {});
        }
      }

      console.log('[load] Complete');
      await statusCh.delete('serverload complete').catch(() => {});

    } catch (err) {
      console.error('[load] ERROR:', err.message);
      await status.edit({ embeds: [errorEmbed(`Load failed: ${err.message}`)] }).catch(() => {});
    }
  },
};

// ── .ts ─────────────────────────────────────────────────────────────────────
const ts = {
  name: 'ts', category: 'utility',
  description: 'Show all your saved server layouts (bot owner only)',
  usage: '.ts', example: '.ts',
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
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`💾 Saved Layouts — ${backups.length}`).setDescription(lines.join('\n\n')).setFooter({ text: '.serverload <n> to restore  ·  .deletesave <n> to delete' })] });
  },
};

// ── .deletesave ──────────────────────────────────────────────────────────────
const deletesave = {
  name: 'deletesave', category: 'utility',
  description: 'Delete a saved server layout by name (bot owner only)',
  usage: '.deletesave <n>', example: '.deletesave UBH',
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


// ── .updateserver <n> ─────────────────────────────────────────────────────
// Re-saves the current server state into an existing named backup
// Keeps the same name but overwrites roles/channels/permissions with current state
const updateserver = {
  name: 'updateserver',
  category: 'utility',
  description: 'Update an existing saved layout with the current server state (bot owner only)',
  usage: '.updateserver <n>',
  example: '.updateserver UBH',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can update server layouts.')] });

    const name = args.join(' ').trim();
    if (!name)
      return message.reply({ embeds: [errorEmbed('Provide the backup name to update.\n**Usage:** `.updateserver <n>`\n**Example:** `.updateserver UBH`')] });

    // Check the backup exists first
    const existing = await Backup.collection.findOne({ ownerId: message.author.id, name });
    if (!existing)
      return message.reply({ embeds: [errorEmbed(`No backup named **${name}** found. Use \`.saveserver ${name}\` to create it first.`)] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Updating **${name}** with current server state...` }]
    });

    try {
      const guild = message.guild;
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});
      await guild.members.fetch().catch(() => {});

      // ── Roles ─────────────────────────────────────────────────────────────
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
        } catch {}
      }
      roles.sort((a, b) => b.position - a.position);

      // ── Bots ─────────────────────────────────────────────────────────────
      const bots = [];
      for (const [, m] of guild.members.cache) {
        if (!m.user.bot) continue;
        bots.push({ id: m.user.id, username: m.user.username, tag: m.user.tag });
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
        } catch {}
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
        } catch {}
      }

      // ── Overwrite existing backup, preserve original savedAt ───────────────
      await Backup.collection.findOneAndUpdate(
        { ownerId: message.author.id, name },
        {
          $set: {
            guildName:  String(guild.name),
            guildId:    String(guild.id),
            updatedAt:  new Date(),
            roles,
            channels,
            bots,
          }
        }
      );

      console.log(`[updateserver] Updated "${name}": ${roles.length} roles, ${channels.length} channels`);

      // Show what changed vs original
      const prevRoles = Array.isArray(existing.roles) ? existing.roles.length : 0;
      const prevChs   = Array.isArray(existing.channels) ? existing.channels.length : 0;
      const roleDiff  = roles.length - prevRoles;
      const chDiff    = channels.length - prevChs;

      const diffText = (n) => n === 0 ? 'no change' : n > 0 ? `+${n}` : `${n}`;

      return status.edit({
        embeds: [successEmbed(
          `✅ **${name}** updated with current server state!\n\n` +
          `🎭 **${roles.length}** roles *(${diffText(roleDiff)})*\n` +
          `📁 **${channels.length}** channels *(${diffText(chDiff)})*\n` +
          `🤖 **${bots.length}** bots\n\n` +
          `All permissions and channel settings have been refreshed.`
        )]
      });

    } catch (err) {
      console.error('[updateserver] ERROR:', err.message);
      return status.edit({ embeds: [errorEmbed(`Update failed: ${err.message}`)] });
    }
  },
};

module.exports = [saveserver, serverload, ts, deletesave, updateserver];
