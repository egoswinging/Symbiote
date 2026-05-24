const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

function markBotDeleted(id) {
  try { require('../events/messageDelete').markBotDeleted(id); } catch {}
}

// .s — snipe
const s = {
  name: 's',
  aliases: ['snipe'],
  category: 'utility',
  description: 'Snipe a recently deleted message',
  usage: '.s [number]',
  example: '.s\n.s 2',
  async execute(message, args, client, config) {
    const index = args[0] ? parseInt(args[0], 10) : 1;
    if (isNaN(index) || index < 1)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Use a valid snipe number, like `.s 2`.')] });

    const snipes = client.snipes.get(message.channel.id) || [];
    const snipe = snipes[index - 1];
    if (!snipe)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription(index === 1 ? 'No sniped message.' : `No snipe found at #${index}.`)] });
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: snipe.author, iconURL: snipe.avatar })
      .setDescription(snipe.content.slice(0, 2000))
      .setFooter({ text: `Snipe ${index}/${snipes.length} - Deleted ${new Date(snipe.timestamp).toLocaleTimeString()}` });
    return message.reply({ embeds: [embed] });
  },
};

// .cs — clear snipe
const cs = {
  name: 'cs',
  aliases: ['clearsnipe', 'clears'],
  category: 'utility',
  description: 'Clear the sniped message for this channel',
  usage: '.cs',
  example: '.cs',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });
    client.snipes.delete(message.channel.id);
    return message.reply({ embeds: [successEmbed('Snipe cleared.')] });
  },
};

// .c — clear messages (never deletes pinned messages)
const c = {
  name: 'c',
  aliases: ['purge', 'clear'],
  category: 'utility',
  description: 'Delete messages (1-100) — never deletes pinned messages',
  usage: '.c <amount>',
  example: '.c 50',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100)
      return message.reply({ embeds: [errorEmbed('Provide a number between 1 and 100.')] });

    // Delete command message itself
    markBotDeleted(message.id);
    await message.delete().catch(() => {});

    const fetched = await message.channel.messages.fetch({ limit: 100 });

    const deletable = fetched.filter(m =>
      // Not pinned
      !m.pinned &&
      // Not older than 14 days (Discord limit)
      Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    ).first(amount);

    if (!deletable.length) {
      const notice = await message.channel.send({ embeds: [errorEmbed('No deletable messages found (messages may be pinned or older than 14 days).')] });
      setTimeout(() => notice.delete().catch(() => {}), 3000);
      return;
    }

    // Mark all as bot-deleted before bulk deleting so logger ignores them
    for (const m of deletable) markBotDeleted(m.id);

    await message.channel.bulkDelete(deletable, true).catch(() => {});

    const notice = await message.channel.send({ embeds: [successEmbed(`Deleted **${deletable.length}** messages.`)] });
    setTimeout(() => notice.delete().catch(() => {}), 3000);
  },
};

// .forcenick
const forcenick = {
  name: 'forcenick',
  aliases: ['fn'],
  category: 'utility',
  description: 'Force or remove a nickname from a user',
  usage: '.forcenick @user [nickname]',
  example: '.forcenick @John BigNerd',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    const nick = args.slice(1).join(' ') || null;
    try {
      await target.setNickname(nick, `Force nick by ${message.author.tag}`);
      await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { forcedNick: nick }, { upsert: true });
      return message.reply({ embeds: [successEmbed(nick ? `Set **${target.user.tag}**'s nickname to: \`${nick}\`` : `Cleared **${target.user.tag}**'s nickname.`)] });
    } catch {
      return message.reply({ embeds: [errorEmbed('Failed to change nickname.')] });
    }
  },
};

// .pic
const pic = {
  name: 'pic',
  category: 'utility',
  description: 'Grant image permissions to a user in this channel',
  usage: '.pic @user',
  example: '.pic @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await message.channel.permissionOverwrites.edit(target, { AttachFiles: true, EmbedLinks: true }, { reason: `Pic perms by ${message.author.tag}` });
    return message.reply({ embeds: [successEmbed(`Granted image permissions to ${target}.`)] });
  },
};

// .drag
const drag = {
  name: 'drag',
  category: 'utility',
  description: 'Drag a user into your voice channel',
  usage: '.drag @user',
  example: '.drag @John',
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
