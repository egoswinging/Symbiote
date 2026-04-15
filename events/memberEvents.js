const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/logger');

async function getAuditEntry(guild, auditType) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return null;
    return entry;
  } catch {
    return null;
  }
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

// Kick + timeout detected via member update / remove
module.exports.guildMemberRemove = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    // Check if it was a kick
    await new Promise(r => setTimeout(r, 1000));
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 5000 && entry.target?.id === member.id) {
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('👢 Member Kicked')
          .addFields(
            { name: 'User',      value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Kicked By', value: `<@${entry.executor.id}> (${entry.executor.tag})`, inline: true },
            { name: 'Reason',    value: entry.reason || 'No reason provided', inline: false },
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp();
        await sendLog(member.guild, embed);
      }
    } catch {}
  },
};

// Timeout detected via member update
module.exports.guildMemberUpdate = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    // Detect timeout being applied
    const wasTimedOut = !oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil;
    const timeoutRemoved = oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil;

    if (wasTimedOut) {
      const entry = await getAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate);
      const until = newMember.communicationDisabledUntil;
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('⏱️ Member Timed Out')
        .addFields(
          { name: 'User',       value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
          { name: 'Timed Out By', value: entry?.executor ? `<@${entry.executor.id}> (${entry.executor.tag})` : 'Unknown', inline: true },
          { name: 'Until',      value: until ? `<t:${Math.floor(until.getTime() / 1000)}:F>` : 'Unknown', inline: true },
          { name: 'Reason',     value: entry?.reason || 'No reason provided', inline: false },
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

// Member joined
module.exports.guildMemberAdd = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const UserData = require('../models/UserData');
    const GuildConfig = require('../models/GuildConfig');

    // Auto-reban clicked users
    const ud = await UserData.findOne({ guildId: member.guild.id, userId: member.id }).lean();
    if (ud?.isClicked) {
      await member.ban({ reason: '[AUTO] Clicked — permanent ban' }).catch(() => {});
      return;
    }

    // Re-apply vanish if they were vanished
    if (ud?.isVanished) {
      const config = await GuildConfig.findOne({ guildId: member.guild.id });
      if (config?.vanishRole) {
        await member.roles.set([member.guild.id]).catch(() => {});
        await member.roles.add(config.vanishRole).catch(() => {});
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('👻 Auto Re-Vanished on Rejoin')
          .addFields({ name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true })
          .setTimestamp();
        await sendLog(member.guild, embed);
      }
    }

    // Log member join
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📥 Member Joined')
      .addFields(
        { name: 'User',    value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await sendLog(member.guild, embed);
  },
};

// Member left
module.exports.guildMemberLeave = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    // Only log leave — kick is handled separately above
    // Small delay to let kick audit log check run first
    await new Promise(r => setTimeout(r, 1500));
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      // If it was a kick, already logged above — skip
      if (entry && Date.now() - entry.createdTimestamp < 6000 && entry.target?.id === member.id) return;
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('📤 Member Left')
      .addFields(
        { name: 'User',   value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await sendLog(member.guild, embed);
  },
};
