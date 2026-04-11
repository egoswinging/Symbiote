const { Events } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');
const AutoResponder = require('../models/AutoResponder');
const PingTrack = require('../models/AutoMod');
const { errorEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

const PREFIX = process.env.PREFIX || '.';
const PING_WINDOW_MS  = 5 * 60 * 1000; // 5 minutes
const PING_LIMIT      = 3;

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    const isBotOwner = ownerIds.includes(message.author.id);

    // Fetch guild config once
    let config = await GuildConfig.findOne({ guildId: message.guild.id });
    if (!config) config = await GuildConfig.create({ guildId: message.guild.id });

    // Fetch user data once
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();

    // ── SHUSH: delete ALL messages from shushed user ─────────────────────────
    if (ud?.isShushed && !isBotOwner) {
      return message.delete().catch(() => {});
    }

    // ── AUTOMOD: word + link filter ───────────────────────────────────────────
    if (config.automod?.enabled && !isBotOwner && !ud?.isSecret && !ud?.isInnerCircle) {
      const content = message.content.toLowerCase();
      let triggered = null;

      // Check banned words
      for (const word of config.automod.words || []) {
        if (content.includes(word)) { triggered = `Banned word: \`${word}\``; break; }
      }

      // Check banned links
      if (!triggered) {
        for (const link of config.automod.links || []) {
          if (content.includes(link.toLowerCase())) { triggered = `Banned link: \`${link}\``; break; }
        }
      }

      if (triggered) {
        await message.delete().catch(() => {});

        // Log it
        const logCh = config.automod.channel
          ? message.guild.channels.cache.get(config.automod.channel)
          : config.logChannel
            ? message.guild.channels.cache.get(config.logChannel)
            : null;

        if (logCh) {
          await logCh.send({
            embeds: [new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('🚫 Automod — Message Deleted')
              .addFields(
                { name: 'User',    value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                { name: 'Reason',  value: triggered, inline: false },
                { name: 'Content', value: message.content.slice(0, 500) || '*empty*', inline: false },
              )
              .setTimestamp()]
          }).catch(() => {});
        }
        return;
      }
    }

    // ── @EVERYONE PING RATE LIMIT ─────────────────────────────────────────────
    if (message.mentions.everyone && !isBotOwner && !ud?.isSecret && !ud?.isInnerCircle) {
      const memberRoles = message.member.roles.cache.map(r => r.id);
      const isAllowed = (config.allowedPingRoles || []).some(id => memberRoles.includes(id));

      if (isAllowed) {
        const now = Date.now();
        const pt = await PingTrack.findOne({ guildId: message.guild.id, userId: message.author.id });
        const recent = (pt?.timestamps || []).filter(t => now - new Date(t).getTime() < PING_WINDOW_MS);
        recent.push(new Date());

        await PingTrack.findOneAndUpdate(
          { guildId: message.guild.id, userId: message.author.id },
          { timestamps: recent },
          { upsert: true }
        );

        if (recent.length > PING_LIMIT) {
          // Timeout the user
          await message.member.timeout(10 * 60 * 1000, 'Exceeded @everyone ping limit (3 per 5min)').catch(() => {});
          await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`<@${message.author.id}> You have been timed out for exceeding the @everyone ping limit (${PING_LIMIT} per 5 minutes).`)] }).catch(() => {});

          // Log it
          const logCh = config.logChannel ? message.guild.channels.cache.get(config.logChannel) : null;
          if (logCh) {
            await logCh.send({
              embeds: [new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('⚠️ @everyone Ping Abuse')
                .addFields(
                  { name: 'User',    value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                  { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                  { name: 'Action',  value: 'Timed out 10 minutes', inline: false },
                  { name: 'Pings',   value: `${recent.length} in last 5 minutes`, inline: false },
                )
                .setTimestamp()]
            }).catch(() => {});
          }
        }
      }
    }

    // ── CLEAN MODE ────────────────────────────────────────────────────────────
    if (client.cleanChannels.has(message.channel.id)) {
      const exempt = isBotOwner || ud?.isWhitelisted || ud?.isSecret || ud?.isInnerCircle;
      if (!exempt && !message.content.startsWith(PREFIX)) {
        return message.delete().catch(() => {});
      }
    }

    // ── AUTO RESPONDER ────────────────────────────────────────────────────────
    if (!message.content.startsWith(PREFIX)) {
      const responders = await AutoResponder.find({ guildId: message.guild.id }).lean();
      for (const ar of responders) {
        if (message.content.toLowerCase().includes(ar.trigger)) {
          await message.channel.send(ar.response).catch(() => {});
          break;
        }
      }
      return;
    }

    // ── PREFIX COMMAND ROUTER ─────────────────────────────────────────────────
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName);
    if (!command) return;

    // Blacklist check — blacklisted users cannot run any command
    if (ud?.isBlacklisted && !isBotOwner) {
      return message.reply({ embeds: [errorEmbed('You are **blacklisted** from using this bot.')] });
    }

    try {
      await command.execute(message, args, client, config);
    } catch (err) {
      console.error(`Command error [${commandName}]:`, err);
      message.reply({ embeds: [errorEmbed(`An error occurred: ${err.message}`)] }).catch(() => {});
    }
  },
};
