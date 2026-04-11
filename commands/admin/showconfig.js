const { requireTier } = require('../../utils/permissions');
const { errorEmbed } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'showconfig',
  category: 'admin',
  description: "Show this guild's config",
  usage: '.showconfig',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const fmt    = id  => id ? `<@&${id}>` : '`Not set`';
    const fmtArr = arr => arr.length ? arr.map(id => `<@&${id}>`).join(', ') : '`None`';

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`⚙️ Server Config — ${message.guild.name}`)
      .addFields(
        { name: '👑 Owner Role',   value: fmt(config.ownerRole),  inline: true },
        { name: '👻 Vanish Role',  value: fmt(config.vanishRole), inline: true },
        { name: '🔑 Access Role',  value: fmt(config.accessRole), inline: true },
        { name: '🔴 V1 Roles',    value: fmtArr(config.v1Roles), inline: false },
        { name: '🟠 V2 Roles',    value: fmtArr(config.v2Roles), inline: false },
        { name: '🟡 V3 Roles',    value: fmtArr(config.v3Roles), inline: false },
        { name: '📋 Log Channel', value: config.logChannel ? `<#${config.logChannel}>` : '`Not set`', inline: true },
        { name: '🛡️ Anti-Nuke',   value: config.antiNuke?.enabled ? '`Enabled`' : '`Disabled`', inline: true },
        { name: '🔊 J2C Channel', value: config.j2cChannel ? `<#${config.j2cChannel}>` : '`Not set`', inline: true },
        { name: '🧹 Clean Channels', value: config.cleanChannels.length ? config.cleanChannels.map(id => `<#${id}>`).join(', ') : '`None`', inline: false },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
