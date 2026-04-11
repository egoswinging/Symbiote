const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember, bulkDelete } = require('../../utils/helpers');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

// ── ,s (snipe) ────────────────────────────────────────────────────────────────
const s = {
  name: 's',
  aliases: ['snipe'],
  category: 'utility',
  description: 'Snipe the last deleted message',
  usage: '.s',

  async execute(message, args, client, config) {
    const snipe = client.snipes.get(message.channel.id);
    if (!snipe)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No sniped message.')] });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: snipe.author, iconURL: snipe.avatar })
      .setDescription(snipe.content.slice(0, 2000))
      .setFooter({ text: `Deleted ${new Date(snipe.timestamp).toLocaleTimeString()}` });

    return message.reply({ embeds: [embed] });
  },
};

// ── ,cs (clear snipe) ─────────────────────────────────────────────────────────
const cs = {
  name: 'cs',
  aliases: ['clearsnipe'],
  category: 'utility',
  description: 'Clear the sniped message for this channel',
  usage: '.cs',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    client.snipes.delete(message.channel.id);
    return message.reply({ embeds: [successEmbed('Snipe cleared.')] });
  },
};

// ── ,c (clear/purge messages) ─────────────────────────────────────────────────
const c = {
  name: 'c',
  aliases: ['purge', 'clear'],
  category: 'utility',
  description: 'Delete a number of messages',
  usage: '.c <amount>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply({ embeds: [errorEmbed('Provide a number between 1 and 100.')] });

    // Delete command message too
    await message.delete().catch(() => {});

    const deleted = await bulkDelete(message.channel, amount);
    const notice  = await message.channel.send({ embeds: [successEmbed(`Deleted **${deleted}** messages.`)] });
    setTimeout(() => notice.delete().catch(() => {}), 3000);
  },
};

// ── ,forcenick ────────────────────────────────────────────────────────────────
const forcenick = {
  name: 'forcenick',
  aliases: ['fn'],
  category: 'utility',
  description: 'Force or remove a nickname from a user',
  usage: '.forcenick <@user> [nickname]',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const nick = args.slice(1).join(' ') || null;

    try {
      await target.setNickname(nick, `Force nick by ${message.author.tag}`);
      await UserData.findOneAndUpdate(
        { guildId: message.guild.id, userId: target.id },
        { forcedNick: nick },
        { upsert: true }
      );

      return message.reply({
        embeds: [successEmbed(nick ? `Set **${target.user.tag}**'s nickname to: \`${nick}\`` : `Cleared **${target.user.tag}**'s nickname.`)]
      });
    } catch {
      return message.reply({ embeds: [errorEmbed('Failed to change nickname — check my permissions.')] });
    }
  },
};

// ── ,pic ──────────────────────────────────────────────────────────────────────
const pic = {
  name: 'pic',
  category: 'utility',
  description: 'Grant image/attachment permissions to a user in this channel',
  usage: '.pic <@user>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await message.channel.permissionOverwrites.edit(target, {
      AttachFiles: true,
      EmbedLinks: true,
    }, { reason: `Pic perms granted by ${message.author.tag}` });

    return message.reply({ embeds: [successEmbed(`Granted image permissions to ${target} in this channel.`)] });
  },
};

// ── ,drag ─────────────────────────────────────────────────────────────────────
const drag = {
  name: 'drag',
  category: 'utility',
  description: 'Drag a user into your current voice channel',
  usage: '.drag <@user>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const myVC = message.member.voice.channel;
    if (!myVC) return message.reply({ embeds: [errorEmbed('You must be in a voice channel.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!target.voice.channel) return message.reply({ embeds: [errorEmbed('That user is not in a voice channel.')] });

    await target.voice.setChannel(myVC, `Dragged by ${message.author.tag}`);
    return message.reply({ embeds: [successEmbed(`Dragged ${target} to **${myVC.name}**.`)] });
  },
};

module.exports = [s, cs, c, forcenick, pic, drag];
