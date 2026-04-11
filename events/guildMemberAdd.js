const { Events } = require('discord.js');
const UserData = require('../models/UserData');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const guild = member.guild;

    // ── Auto-reban clicked users ──────────────────────────────────────────────
    const ud = await UserData.findOne({ guildId: guild.id, userId: member.id }).lean();

    if (ud?.isClicked) {
      await member.ban({ reason: '[AUTO] User is clicked — permanent ban' }).catch(() => {});
      console.log(`Auto-rebanned clicked user: ${member.user.tag} in ${guild.name}`);
      return; // no point doing anything else, they're banned
    }

    // ── Re-apply vanish if they were vanished when they left ─────────────────
    if (ud?.isVanished) {
      const config = await GuildConfig.findOne({ guildId: guild.id });
      if (!config?.vanishRole) return;

      // Give them only the vanish role — no other roles
      await member.roles.set([guild.id], 'Auto re-vanished on rejoin').catch(() => {});
      await member.roles.add(config.vanishRole, 'Auto re-vanished on rejoin').catch(() => {});

      console.log(`Auto re-vanished ${member.user.tag} on rejoin in ${guild.name}`);

      // Log it
      const { sendLog } = require('../utils/logger');
      const { EmbedBuilder } = require('discord.js');
      const logEmbed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('👻 Auto Re-Vanish on Rejoin')
        .addFields(
          { name: 'User',   value: `<@${member.id}> (${member.user.tag})`, inline: true },
          { name: 'Action', value: 'Vanish role re-applied automatically',  inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    }
  },
};
