const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/logger');
const GuildConfig = require('../models/GuildConfig');

async function getAuditEntry(guild, auditType) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return null;
    return entry;
  } catch { return null; }
}

// Send to welcome channel (separate from mod logs)
async function sendWelcome(guild, embed) {
  try {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.welcomeChannel) return;
    const channel = guild.channels.cache.get(config.welcomeChannel);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch {}
}

// Ban
module.exports.guildBanAdd = {
  name: Events.GuildBanAdd,
  async execute(ban, client) {
    const entry = await getAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd);
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔨 Member Banned')
      .addFields(
        { name: 'User',      value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
        { name: 'Banned By', value: entry?.executor ? `<@${entry.executor.id}> (${entry.executor.tag})` : 'Unknown', inline: true },
        { name: 'Reason',    value: entry?.reason || ban.reason || 'No reason provided', inline: false },
      )
      .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await sendLog(ban.guild, embed);
  },
};

// Unban
module.exports.guildBanRemove = {
  name: Events.GuildBanRemove,
  async execute(ban, client) {
    const entry = await getAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove);
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Member Unbanned')
      .addFields(
        { name: 'User',        value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
        { name: 'Unbanned By', value: entry?.executor ? `<@${entry.executor.id}> (${entry.executor.tag})` : 'Unknown', inline: true },
      )
      .setTimestamp();
    await sendLog(ban.guild, embed);
  },
};

// Kick detection
module.exports.guildMemberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    await new Promise(r => setTimeout(r, 1000));

    // Check if kicked
    let wasKicked = false;
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 5000 && entry.target?.id === member.id) {
        wasKicked = true;
        // Log kick to mod logs
        const kickEmbed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('👢 Member Kicked')
          .addFields(
            { name: 'User',      value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Kicked By', value: `<@${entry.executor.id}> (${entry.executor.tag})`, inline: true },
            { name: 'Reason',    value: entry.reason || 'No reason provided', inline: false },
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();
        await sendLog(member.guild, kickEmbed);
      }
    } catch {}

    // Send leave message to welcome channel (not mod logs)
    const leaveEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('📤 Member Left')
      .setDescription(wasKicked ? `${member.user.tag} was **kicked** from the server.` : `${member.user.tag} left the server.`)
      .addFields(
        { name: 'User',   value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await sendWelcome(member.guild, leaveEmbed);
  },
};

// Timeout
module.exports.guildMemberUpdate = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    const wasTimedOut  = !oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil;
    const timeoutRemoved = oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil;

    if (wasTimedOut) {
      const entry = await getAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate);
      const until = newMember.communicationDisabledUntil;
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('⏱️ Member Timed Out')
        .addFields(
          { name: 'User',         value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
          { name: 'Timed Out By', value: entry?.executor ? `<@${entry.executor.id}> (${entry.executor.tag})` : 'Unknown', inline: true },
          { name: 'Until',        value: until ? `<t:${Math.floor(until.getTime() / 1000)}:F>` : 'Unknown', inline: true },
          { name: 'Reason',       value: entry?.reason || 'No reason provided', inline: false },
        )
        .setTimestamp();
      await sendLog(newMember.guild, embed);
    }

    if (timeoutRemoved) {
      const entry = await getAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Timeout Removed')
        .addFields(
          { name: 'User',       value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
          { name: 'Removed By', value: entry?.executor ? `<@${entry.executor.id}> (${entry.executor.tag})` : 'Unknown', inline: true },
        )
        .setTimestamp();
      await sendLog(newMember.guild, embed);
    }
  },
};

// Join — welcome channel + auto-reban/revanish + mod log
module.exports.guildMemberAdd = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const UserData   = require('../models/UserData');

    const ud = await UserData.findOne({ guildId: member.guild.id, userId: member.id }).lean();

    // Auto-reban clicked users
    if (ud?.isClicked) {
      await member.ban({ reason: '[AUTO] Clicked — permanent ban' }).catch(() => {});
      return;
    }

    // Re-apply vanish
    if (ud?.isVanished) {
      const config = await GuildConfig.findOne({ guildId: member.guild.id });
      if (config?.vanishRole) {
        await member.roles.set([member.guild.id]).catch(() => {});
        await member.roles.add(config.vanishRole).catch(() => {});
        const revanishEmbed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('👻 Auto Re-Vanished on Rejoin')
          .addFields({ name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true })
          .setTimestamp();
        await sendLog(member.guild, revanishEmbed);
      }
    }

    // Send join message to WELCOME channel (not mod logs)
    const joinEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📥 Welcome!')
      .setDescription(`<@${member.id}> just joined the server!`)
      .addFields(
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Member Count',    value: `\`${member.guild.memberCount}\``, inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await sendWelcome(member.guild, joinEmbed);

    // Also log join to MOD LOGS channel
    const modLogEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📥 Member Joined')
      .addFields(
        { name: 'User',    value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await sendLog(member.guild, modLogEmbed);
  },
};
