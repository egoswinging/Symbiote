const { errorEmbed, successEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
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
      return message.reply({ embeds: [errorEmbed('Provide a name.\n**Usage:** `.saveserver <n>`')] });

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Saving **${name}**...` }]
    });

    try {
      const guild = message.guild;

      // Force fresh fetch
      await guild.channels.fetch();
      await guild.roles.fetch();

      // ── Roles ─────────────────────────────────────────────────────────────
      const rolesArr = [];
      for (const [, r] of guild.roles.cache) {
        if (!r || r.id === guild.id || r.managed) continue;
        rolesArr.push({
          name:        r.name,
          color:       r.color,
          hoist:       r.hoist,
          position:    r.position,
          permissions: r.permissions.bitfield.toString(),
          mentionable: r.mentionable,
        });
      }
      rolesArr.sort((a, b) => a.position - b.position);

      // ── Channels ──────────────────────────────────────────────────────────
      const channelsArr = [];
      const allChannels = [...guild.channels.cache.values()].filter(Boolean);

      // Helper — only save ROLE-based permission overwrites (type 0)
      // Member overwrites (type 1) are skipped — can't reliably restore
      function getOverwrites(ch) {
        const result = [];
        if (!ch || !ch.permissionOverwrites) return result;
        for (const [, ow] of ch.permissionOverwrites.cache) {
          if (!ow || ow.type !== 0) continue; // role only
          const role = guild.roles.cache.get(ow.id);
          if (!role) continue;
          result.push({
            name:  role.name,
            type:  0,
            allow: ow.allow.bitfield.toString(),
            deny:  ow.deny.bitfield.toString(),
          });
        }
        return result;
      }

      // Categories first
      const cats = allChannels
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const cat of cats) {
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
          permissionOverwrites: getOverwrites(cat),
        });
      }

      // Non-category channels
      const nonCats = allChannels
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const ch of nonCats) {
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
          permissionOverwrites: getOverwrites(ch),
        });
      }

      console.log(`[saveserver] Saving ${rolesArr.length} roles, ${channelsArr.length} channels as "${name}"`);

      // ── Save to DB ─────────────────────────────────────────────────────────
      const saved = await Backup.findOneAndUpdate(
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

      if (!saved) throw new Error('Database did not confirm the save.');

      console.log(`[saveserver] Saved successfully. DB ID: ${saved._id}`);

      return status.edit({
        embeds: [successEmbed(
          `✅ Saved **${name}**!\n` +
          `**${rolesArr.length}** roles · **${channelsArr.length}** channels\n\n` +
          `Use \`.ts\` to view all saves.\n` +
          `Use \`.serverload ${name}\` to restore in any server.`
        )]
      });

    } catch (err) {
      console.error('[saveserver] Error:', err);
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

    const guild    = message.guild;
    const statusCh = message.channel;

    // Delete the command message immediately
    await message.delete().catch(() => {});

    const status = await statusCh.send({
      embeds: [{ color: 0x5865F2, description: `⏳ Loading **${name}**...\nDeleting all channels and roles — please wait.` }]
    });

    try {
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // ── Phase 1: Delete all channels except status channel ────────────────
      console.log('[serverload] Phase 1: Deleting channels');
      for (const [, ch] of guild.channels.cache) {
        if (!ch || ch.id === statusCh.id) continue;
        await ch.delete('serverload').catch(() => {});
        await delay(350);
      }

      // ── Phase 2: Delete all editable roles ────────────────────────────────
      console.log('[serverload] Phase 2: Deleting roles');
      const myHighest = guild.members.me?.roles?.highest?.position ?? 999;
      const delRoles = [...guild.roles.cache.values()]
        .filter(r => r && r.id !== guild.id && !r.managed && r.position < myHighest)
        .sort((a, b) => a.position - b.position);

      for (const role of delRoles) {
        await role.delete('serverload').catch(() => {});
        await delay(350);
      }

      // ── Phase 3: Recreate roles ────────────────────────────────────────────
      console.log(`[serverload] Phase 3: Creating ${backup.roles.length} roles`);
      const roleMap = {}; // saved name → new role ID
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
        } catch (err) {
          console.warn(`[serverload] Role skip [${r.name}]: ${err.message}`);
        }
      }

      // Build Discord permission overwrites array from saved role names
      function buildOverwrites(savedOws) {
        if (!savedOws?.length) return [];
        const result = [];
        for (const ow of savedOws) {
          const id = roleMap[ow.name];
          if (!id) continue;
          try {
            result.push({
              id,
              type:  0,
              allow: BigInt(ow.allow || '0'),
              deny:  BigInt(ow.deny  || '0'),
            });
          } catch {}
        }
        return result;
      }

      // ── Phase 4: Recreate categories ──────────────────────────────────────
      console.log('[serverload] Phase 4: Creating categories');
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
        } catch (err) {
          console.warn(`[serverload] Category skip [${cat.name}]: ${err.message}`);
        }
      }

      // ── Phase 5: Recreate text/voice channels ─────────────────────────────
      console.log('[serverload] Phase 5: Creating channels');
      const others = backup.channels
        .filter(c => c.type !== ChannelType.GuildCategory)
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
        } catch (err) {
          console.warn(`[serverload] Channel skip [${ch.name}]: ${err.message}`);
        }
      }

      // ── Phase 6: Delete status channel ────────────────────────────────────
      console.log('[serverload] Complete — deleting status channel');
      await statusCh.delete('serverload complete').catch(() => {});

    } catch (err) {
      console.error('[serverload] Fatal error:', err);
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
