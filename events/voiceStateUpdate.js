const { Events, PermissionsBitField } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    const guild = newState.guild || oldState.guild;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.j2cChannel) return;

    const member = newState.member || oldState.member;

    // ── User joins the J2C trigger channel ──────────────────────────────────
    if (newState.channelId === config.j2cChannel) {
      try {
        const category = guild.channels.cache.get(config.j2cCategory);

        const newVC = await guild.channels.create({
          name: `${member.displayName}'s channel`,
          type: 2, // GuildVoice
          parent: category || null,
          permissionOverwrites: [
            {
              id: member.id,
              allow: [
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MoveMembers,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
              ],
            },
            {
              id: guild.id,
              allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
            },
          ],
        });

        // Track owner
        client.j2cOwners.set(newVC.id, member.id);

        // Move member into their new channel
        await member.voice.setChannel(newVC);
      } catch (err) {
        console.error('J2C create failed:', err.message);
      }
    }

    // ── User leaves a J2C channel → delete if empty ──────────────────────────
    if (oldState.channelId && client.j2cOwners.has(oldState.channelId)) {
      const ch = guild.channels.cache.get(oldState.channelId);
      if (ch && ch.members.size === 0) {
        client.j2cOwners.delete(oldState.channelId);
        await ch.delete('J2C: empty channel').catch(() => {});
      }
    }
  },
};
