const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const GuildConfig = require('../../models/GuildConfig');
const { ChannelType, PermissionsBitField } = require('discord.js');

// ── helper: get J2C channel the invoker owns ──────────────────────────────────
function getOwnedJ2C(member, client) {
  const vc = member.voice.channel;
  if (!vc) return null;
  if (client.j2cOwners.get(vc.id) !== member.id) return null;
  return vc;
}

// ── ,setupj2c ─────────────────────────────────────────────────────────────────
const setupj2c = {
  name: 'setupj2c',
  category: 'voice',
  description: 'Set the join-to-create voice channel',
  usage: '.setupj2c',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can setup J2C.')] });

    // Create a category for J2C channels
    const category = await message.guild.channels.create({
      name: '🔊 Voice Channels',
      type: ChannelType.GuildCategory,
      reason: 'J2C Setup',
    });

    // Create the trigger channel
    const trigger = await message.guild.channels.create({
      name: '➕ Join to Create',
      type: ChannelType.GuildVoice,
      parent: category.id,
      reason: 'J2C Setup',
    });

    await GuildConfig.updateOne(
      { guildId: message.guild.id },
      { j2cChannel: trigger.id, j2cCategory: category.id }
    );

    return message.reply({ embeds: [successEmbed(`J2C setup! Members who join **${trigger.name}** will get their own voice channel.`)] });
  },
};

// ── ,vclaim ───────────────────────────────────────────────────────────────────
const vclaim = {
  name: 'vclaim',
  category: 'voice',
  description: 'Claim ownership of a J2C channel if the owner left',
  usage: '.vclaim',

  async execute(message, args, client, config) {
    const vc = message.member.voice.channel;
    if (!vc) return message.reply({ embeds: [errorEmbed('You must be in a voice channel.')] });

    if (!client.j2cOwners.has(vc.id))
      return message.reply({ embeds: [errorEmbed('That is not a J2C channel.')] });

    const currentOwner = client.j2cOwners.get(vc.id);
    if (vc.members.has(currentOwner))
      return message.reply({ embeds: [errorEmbed('The owner is still in the channel.')] });

    client.j2cOwners.set(vc.id, message.author.id);
    await vc.permissionOverwrites.edit(message.member, {
      ManageChannels: true,
      MoveMembers: true,
    });

    return message.reply({ embeds: [successEmbed(`You now own **${vc.name}**.`)] });
  },
};

// ── ,vclock ───────────────────────────────────────────────────────────────────
const vclock = {
  name: 'vclock',
  category: 'voice',
  description: 'Lock your J2C channel',
  usage: '.vclock',

  async execute(message, args, client, config) {
    const vc = getOwnedJ2C(message.member, client);
    if (!vc) return message.reply({ embeds: [errorEmbed('You must be the owner of a J2C channel.')] });

    await vc.permissionOverwrites.edit(message.guild.id, { Connect: false });
    return message.reply({ embeds: [successEmbed(`🔒 **${vc.name}** is now locked.`)] });
  },
};

// ── ,vcunlock ─────────────────────────────────────────────────────────────────
const vcunlock = {
  name: 'vcunlock',
  category: 'voice',
  description: 'Unlock your J2C channel',
  usage: '.vcunlock',

  async execute(message, args, client, config) {
    const vc = getOwnedJ2C(message.member, client);
    if (!vc) return message.reply({ embeds: [errorEmbed('You must be the owner of a J2C channel.')] });

    await vc.permissionOverwrites.edit(message.guild.id, { Connect: true });
    return message.reply({ embeds: [successEmbed(`🔓 **${vc.name}** is now unlocked.`)] });
  },
};

// ── ,vcpermit ─────────────────────────────────────────────────────────────────
const vcpermit = {
  name: 'vcpermit',
  category: 'voice',
  description: 'Permit a user to join your locked J2C channel',
  usage: '.vcpermit <@user>',

  async execute(message, args, client, config) {
    const vc = getOwnedJ2C(message.member, client);
    if (!vc) return message.reply({ embeds: [errorEmbed('You must be the owner of a J2C channel.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await vc.permissionOverwrites.edit(target, { Connect: true });
    return message.reply({ embeds: [successEmbed(`${target} can now join **${vc.name}**.`)] });
  },
};

// ── ,vcreject ─────────────────────────────────────────────────────────────────
const vcreject = {
  name: 'vcreject',
  category: 'voice',
  description: 'Reject (kick) a user from your J2C channel',
  usage: '.vcreject <@user>',

  async execute(message, args, client, config) {
    const vc = getOwnedJ2C(message.member, client);
    if (!vc) return message.reply({ embeds: [errorEmbed('You must be the owner of a J2C channel.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await vc.permissionOverwrites.edit(target, { Connect: false });

    // Disconnect if currently in the channel
    if (target.voice.channelId === vc.id) {
      await target.voice.disconnect(`Rejected by J2C owner`).catch(() => {});
    }

    return message.reply({ embeds: [successEmbed(`${target} has been **rejected** from **${vc.name}**.`)] });
  },
};

module.exports = [setupj2c, vclaim, vclock, vcunlock, vcpermit, vcreject];
