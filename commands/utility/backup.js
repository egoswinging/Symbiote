const { errorEmbed, successEmbed } = require('../../utils/embeds');
const Backup = require('../../models/Backup');
const { EmbedBuilder, ChannelType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
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
      embeds: [{ color: 0x5865F2, description: `⏳ Saving **${name}**...` }]
    });

    try {
      const guild = message.guild;

      // Fetch everything fresh
      await guild.channels.fetch();
      await guild.roles.fetch();

      // ── Roles ───────────────────────────────────────────────────────────────
      const rolesArr = [...guild.roles.cache.values()]
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

      // ── Channels ────────────────────────────────────────────────────────────
      const channelsArr = [];

      // Helper to serialize permission overwrites
      function serializeOverwrites(channel) {
        return [...channel.permissionOverwrites.cache.values()].map(ow => {
          // Store by role NAME so we can re-link after load
          const role   = guild.roles.cache.get(ow.id);
          const member = guild.members.cache.get(ow.id);
          const name   = role?.name || member?.user?.tag || ow.id;
          return {
            name,
            type:  ow.type,  // 0=role 1=member
            allow: ow.allow.bitfield.toString(),
            deny:  ow.deny.bitfield.toString(),
          };
        });
      }

      // Categories first (sorted by position)
      const cats = [...guild.channels.cache.values()]
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

      for (const cat of cats) {
        channelsArr.push({
          name:                 cat.name,
          type:                 cat.type,
          position:             cat.position,
          parentName:           null,
          topic:                null,
          nsfw:                 false,
          rateLimitPerUser:     0,
          bitrate:              null,
          userLimit:            null,
          permissionOverwrites: serializeOverwrites(cat),
        });
      }

      // Then text/voice/etc channels (sorted by position)
      const nonCats = [...guild.channels.cache.values()]
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

      for (const ch of nonCats) {
        channelsArr.push({
          name:                 ch.name,
          type:                 ch.type,
          position:             ch.position,
          parentName:           ch.parent?.name || null,
          topic:                ch.topic || null,
          nsfw:                 ch.nsfw || false,
          rateLimitPerUser:     ch.rateLimitPerUser || 0,
          bitrate:              ch.bitrate || null,
          userLimit:            ch.userLimit || null,
          permissionOverwrites: serializeOverwrites(ch),
        });
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
          `**${rolesArr.length}** roles · **${channelsArr.length}** channels\n` +
          `Use \`.ts\` to view all saved layouts.`
        )]
      });

    } catch (err) {
      console.error('saveserver error:', err);
      return status.edit({ embeds: [errorEmbed(`Save failed: ${err.message}`)] });
    }
  },
};

// ── .serverload <name> ────────────────────────────────────────────────────────
const serverload = {
  name: 'serverload',
  category: 'utility',
  description: 'Wipe server and restore a saved layout (bot owner only)',
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
      return message.reply({ embeds: [errorEmbed(`No backup found named **${name}**. Use \`.ts\` to see saved layouts.`)] });

    const guild = message.guild;
    const statusCh = message.channel;

    const status = await message.reply({
      embeds: [{ color: 0x5865F2, description: `⏳ Loading **${name}**...\nThis will wipe all channels and roles. Please wait.` }]
    });

    try {
      await guild.channels.fetch();
      await guild.roles.fetch();

      // ── Phase 1: Delete all channels (keep status channel for now) ────────
      let deleted = 0;
      const channelList = [...guild.channels.cache.values()];
      for (const ch of channelList) {
        if (ch.id === statusCh.id) continue;
        await ch.delete('serverload: clearing').catch(() => {});
        deleted++;
        await delay(350);
      }

      // ── Phase 2: Delete all editable roles ───────────────────────────────
      const rolesToDelete = [...guild.roles.cache.values()]
        .filter(r =>
          r.id !== guild.id &&
          !r.managed &&
          r.position < guild.members.me.roles.highest.position
        )
        .sort((a, b) => a.position - b.position);

      for (const role of rolesToDelete) {
        await role.delete('serverload: clearing').catch(() => {});
        await delay(350);
      }

      // ── Phase 3: Recreate roles (bottom to top) ───────────────────────────
      // Map: saved role name → new Discord role ID
      const roleMap = {};
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
          await delay(350);
        } catch (err) {
          console.error(`Role create failed [${r.name}]:`, err.message);
        }
      }

      // Helper to convert saved overwrites to Discord format using roleMap
      function buildOverwrites(savedOws) {
        const result = [];
        for (const ow of savedOws) {
          const id = roleMap[ow.name];
          if (!id) continue; // skip if role wasn't recreated
          try {
            result.push({
              id,
              type:  ow.type,
              allow: BigInt(ow.allow),
              deny:  BigInt(ow.deny),
            });
          } catch {}
        }
        return result;
      }

      // ── Phase 4: Recreate categories ─────────────────────────────────────
      const catMap = {}; // saved category name → new channel ID
      const catChannels = backup.channels
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

      for (const cat of catChannels) {
        try {
          const created = await guild.channels.create({
            name:                 cat.name,
            type:                 ChannelType.GuildCategory,
            position:             cat.position,
            permissionOverwrites: buildOverwrites(cat.permissionOverwrites),
            reason:               `serverload: ${name}`,
          });
          catMap[cat.name] = created.id;
          await delay(350);
        } catch (err) {
          console.error(`Category create failed [${cat.name}]:`, err.message);
        }
      }

      // ── Phase 5: Recreate text/voice channels ─────────────────────────────
      const otherChannels = backup.channels
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

      for (const ch of otherChannels) {
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
          await delay(350);
        } catch (err) {
          console.error(`Channel create failed [${ch.name}]:`, err.message);
        }
      }

      // ── Phase 6: Delete the status channel ───────────────────────────────
      await statusCh.delete('serverload: complete').catch(() => {});

    } catch (err) {
      console.error('serverload error:', err);
      await status.edit({ embeds: [errorEmbed(`Load failed: ${err.message}`)] }).catch(() => {});
    }
  },
};

// ── .ts — list saved templates ────────────────────────────────────────────────
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
          .setDescription('No saved layouts yet. Use `.saveserver <name>` to save one.')]
      });

    const lines = backups.map((b, i) => {
      const date = new Date(b.savedAt).toLocaleDateString('en-GB');
      return (
        `\`${i + 1}.\` **${b.name}**\n` +
        `> 📁 *${b.guildName}* · ${b.roles.length} roles · ${b.channels.length} channels · saved ${date}`
      );
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`💾 Saved Server Layouts — ${backups.length}`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: '.serverload <name> to restore  ·  .deletesave <name> to delete' });

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
      return message.reply({ embeds: [errorEmbed('Provide the name.\n**Usage:** `.deletesave <name>`')] });

    const result = await Backup.deleteOne({ ownerId: message.author.id, name });
    if (!result.deletedCount)
      return message.reply({ embeds: [errorEmbed(`No backup found named **${name}**. Use \`.ts\` to see your saves.`)] });

    return message.reply({ embeds: [successEmbed(`Deleted saved layout **${name}**.`)] });
  },
};

module.exports = [saveserver, serverload, ts, deletesave];
