const { Events, EmbedBuilder, InteractionContextType } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const { sendLog } = require('../utils/logger');

/**
 * This event fires for ALL interactions — slash commands, context menus, buttons, etc.
 *
 * The threat: Discord allows users to install bots to their personal account
 * (user-installed / "personal apps"). These bots can then be used in ANY server
 * the user is in, even if that bot was never invited to the server.
 * The commands run with the USER's permissions, not the server's bot permissions,
 * so they can bypass server-level bot restrictions.
 *
 * Counter: When an interaction comes from a user-installed app context
 * (interactionContext = BotDM or PrivateChannel or USER_INSTALLED),
 * we detect it and can warn/log/punish.
 */
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.guild) return;

    const config = await GuildConfig.findOne({ guildId: interaction.guild.id });

    // ── Block / log user-installed personal app interactions ──────────────────
    // context === 2 means USER_INSTALLED (personal app, not server-added)
    // context === 1 means BOT_DM
    // context === 0 means GUILD (normal server bot — allow)
    const isUserInstalled =
      interaction.context !== undefined && interaction.context !== 0;

    if (isUserInstalled && config?.antiNuke?.blockUserApps !== false) {
      const member = interaction.member;
      const userId = interaction.user.id;

      // Never block the bot owner or inner circle
      const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
      if (ownerIds.includes(userId)) return;

      const UserData = require('../models/UserData');
      const ud = await UserData.findOne({ guildId: interaction.guild.id, userId }).lean();
      if (ud?.isInnerCircle || ud?.isSecret) return;

      // Try to respond with an error (may fail depending on interaction type)
      try {
        await interaction.reply({
          content: '❌ Personal app commands are **not permitted** in this server.',
          ephemeral: true,
        });
      } catch {}

      // Log it
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Personal App Command Blocked')
        .setDescription(
          'A user attempted to use a **user-installed personal app** in this server.\n' +
          'This could be an attempt to bypass server bot restrictions.'
        )
        .addFields(
          { name: 'User',    value: `<@${userId}> (${interaction.user.tag})`, inline: true },
          { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
          { name: 'Command', value: interaction.commandName ? `\`${interaction.commandName}\`` : '`Unknown`', inline: true },
          { name: 'App Context', value: `\`${interaction.context}\` (0=server, 1=bot DM, 2=user-installed)`, inline: false },
        )
        .setTimestamp();

      await sendLog(interaction.guild, embed);

      // If antinuke is enabled, also apply the anti-nuke punishment
      if (config?.antiNuke?.enabled) {
        try {
          const { trackAction } = require('../utils/antiNukeTracker');
          const exceeded = trackAction(interaction.guild.id, userId, 'userApp', 3);

          if (exceeded && member) {
            const punishment = config.antiNuke.punishment || 'kick';
            switch (punishment) {
              case 'kick':
                await interaction.guild.members.kick(userId, 'Personal app command abuse').catch(() => {});
                break;
              case 'ban':
                await interaction.guild.members.ban(userId, { reason: 'Personal app command abuse' }).catch(() => {});
                break;
              case 'timeout':
                const mins = config.antiNuke.timeoutDuration || 60;
                await member.timeout(mins * 60 * 1000, 'Personal app command abuse').catch(() => {});
                break;
              case 'removeRoles':
                const roles = interaction.guild.members.cache.get(userId)?.roles?.cache?.filter(r => r.id !== interaction.guild.id && !r.managed);
                if (roles) await interaction.guild.members.cache.get(userId)?.roles?.remove(roles).catch(() => {});
                break;
            }
          }
        } catch {}
      }

      return; // Block the interaction
    }

    // ── Normal bot interaction handling (slash commands etc) ──────────────────
    if (!interaction.isChatInputCommand()) return;

    const command = client.slashCommands?.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client, config);
    } catch (err) {
      console.error(`Slash command error [${interaction.commandName}]:`, err);
      const errMsg = { content: 'An error occurred.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};
