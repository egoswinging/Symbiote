const { Events, EmbedBuilder, PermissionsBitField } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

function j2cHelpEmbed(ownerId) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Your Voice Channel Controls')
    .setDescription([
      `<@${ownerId}> owns this voice channel.`,
      '',
      'Copy one of these commands into chat:',
      '`.vcname chill room` - rename this VC',
      '`.vclimit 5` - set a user limit',
      '`.vclimit 0` - remove the user limit',
      '`.vckick @user` - kick someone out of this VC',
      '`.vclock` - lock the VC',
      '`.vcunlock` - unlock the VC',
      '`.vcpermit @user` - let someone join while locked',
      '`.vcreject @user` - kick and block someone',
      '`.vclaim` - claim this VC if the owner left',
    ].join('\n'));
}

async function sendJ2CControls(channel, member) {
  const payload = { embeds: [j2cHelpEmbed(member.id)] };
  await channel.send(payload).catch(() => member.send(payload).catch(() => null));
}

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
        const triggerChannel = newState.channel || await guild.channels.fetch(config.j2cChannel).catch(() => null);
        const parentId = triggerChannel?.parentId || config.j2cCategory || null;

        const newVC = await guild.channels.create({
          name: `${member.displayName}'s channel`,
          type: 2, // GuildVoice
          parent: parentId,
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
        await sendJ2CControls(newVC, member);
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
