/**
 * Reaction Roles command
 * 
 * ,rr setup <#channel> <messageId>          — attach a panel to an existing message
 * ,rr add <messageId> <emoji> <@role>       — add an emoji→role mapping
 * ,rr remove <messageId> <emoji>            — remove one emoji→role mapping
 * ,rr list <messageId>                      — list all mappings on a message
 * ,rr clear <messageId>                     — remove ALL mappings (keeps message)
 * ,rr delete <messageId>                    — remove ALL mappings AND unreact bot
 * ,rr create <#channel> <title> [desc]      — let the bot POST the panel message
 */

const ReactionRole = require('../../models/ReactionRole');
const { requireTier } = require('../../utils/permissions');
const { EmbedBuilder } = require('discord.js');

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Normalise an emoji string to the key we store.
 *  Custom: <:name:id> or <a:name:id>  → we store just the id (e.g. "123456")
 *  Unicode: 👍                         → we store the literal character(s)
 */
function normaliseEmoji(raw) {
  if (!raw) return '';
  const customMatch = raw.match(/^<a?:[^:]+:(\d+)>$/);
  if (customMatch) return customMatch[1];
  return raw.trim();
}

/** Return the string Discord expects when calling message.react() */
function reactableEmoji(stored, guild) {
  // If it's all digits it's a custom emoji id — find it in the guild cache
  if (/^\d+$/.test(stored)) {
    const found = guild.emojis.cache.get(stored);
    return found ? found.toString() : stored;
  }
  return stored; // unicode
}

/** Resolve a role from a mention or id string */
function resolveRole(guild, str) {
  if (!str) return null;
  const id = str.replace(/\D/g, '');
  return guild.roles.cache.get(id) || null;
}

async function fetchPanelMessage(guild, channelId, messageId) {
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.messages) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

// ─── sub-commands ─────────────────────────────────────────────────────────────

async function handleSetup(message, args) {
  // ,rr setup <#channel> <messageId>
  const channelMention = args[0];
  const messageId = args[1];
  if (!channelMention || !messageId)
    return message.reply('Usage: `,rr setup <#channel> <messageId>`');

  const channelId = channelMention.replace(/\D/g, '');
  const channel = message.guild.channels.cache.get(channelId);
  if (!channel) return message.reply('❌ Channel not found.');

  let target;
  try {
    target = await channel.messages.fetch(messageId);
  } catch {
    return message.reply('❌ Message not found in that channel.');
  }

  // Upsert — if a doc already exists for this message just confirm
  await ReactionRole.findOneAndUpdate(
    { guildId: message.guild.id, messageId },
    { $setOnInsert: { guildId: message.guild.id, channelId: channel.id, messageId, entries: [] } },
    { upsert: true, new: true }
  );

  return message.reply(
    `✅ Reaction-role panel registered for message \`${messageId}\` in <#${channel.id}>.\n` +
    `Now use \`,rr add ${messageId} <emoji> <@role>\` to add mappings.`
  );
}

async function handleCreate(message, args) {
  // ,rr create <#channel> <title> [description...]
  const channelMention = args[0];
  const title = args[1];
  const desc = args.slice(2).join(' ') || 'React below to receive a role!';

  if (!channelMention || !title)
    return message.reply('Usage: `,rr create <#channel> <title> [description]`');

  const channelId = channelMention.replace(/\D/g, '');
  const channel = message.guild.channels.cache.get(channelId);
  if (!channel) return message.reply('❌ Channel not found.');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(0x5865F2)
    .setFooter({ text: 'React to get a role • Remove reaction to lose it' });

  const posted = await channel.send({ embeds: [embed] });

  await ReactionRole.create({
    guildId: message.guild.id,
    channelId: channel.id,
    messageId: posted.id,
    entries: [],
  });

  return message.reply(
    `✅ Panel posted in <#${channel.id}> (message ID: \`${posted.id}\`).\n` +
    `Now use \`,rr add ${posted.id} <emoji> <@role>\` to add mappings.`
  );
}

async function handleAdd(message, args) {
  // ,rr add <messageId> <emoji> <@role>
  const [messageId, rawEmoji, roleStr] = args;
  if (!messageId || !rawEmoji || !roleStr)
    return message.reply('Usage: `,rr add <messageId> <emoji> <@role>`');

  const doc = await ReactionRole.findOne({ guildId: message.guild.id, messageId });
  if (!doc)
    return message.reply('❌ No panel found for that message ID. Run `,rr setup` first.');

  const role = resolveRole(message.guild, roleStr);
  if (!role) return message.reply('❌ Role not found.');

  const emoji = normaliseEmoji(rawEmoji);

  // Check for duplicates
  if (doc.entries.some(e => e.emoji === emoji))
    return message.reply('❌ That emoji is already mapped on this panel.');
  if (doc.entries.some(e => e.roleId === role.id))
    return message.reply('❌ That role is already mapped on this panel.');

  doc.entries.push({ emoji, roleId: role.id });
  await doc.save();

  // React on the actual message so users can see the button
  try {
    const target = await fetchPanelMessage(message.guild, doc.channelId, messageId);
    if (!target) throw new Error('Panel message not found');
    await target.react(reactableEmoji(emoji, message.guild));
  } catch (err) {
    console.error('RR react error:', err);
  }

  return message.reply(`✅ Mapped ${rawEmoji} → **${role.name}** on panel \`${messageId}\`.`);
}

async function handleRemove(message, args) {
  // ,rr remove <messageId> <emoji>
  const [messageId, rawEmoji] = args;
  if (!messageId || !rawEmoji)
    return message.reply('Usage: `,rr remove <messageId> <emoji>`');

  const doc = await ReactionRole.findOne({ guildId: message.guild.id, messageId });
  if (!doc) return message.reply('❌ No panel found for that message ID.');

  const emoji = normaliseEmoji(rawEmoji);
  const before = doc.entries.length;
  doc.entries = doc.entries.filter(e => e.emoji !== emoji);

  if (doc.entries.length === before)
    return message.reply('❌ That emoji is not mapped on this panel.');

  await doc.save();

  // Remove the bot's reaction
  try {
    const target = await fetchPanelMessage(message.guild, doc.channelId, messageId);
    if (!target) throw new Error('Panel message not found');
    const reaction = target.reactions.cache.find(
      r => r.emoji.id === emoji || r.emoji.name === emoji
    );
    if (reaction) await reaction.users.remove(message.client.user.id);
  } catch (err) {
    console.error('RR unreact error:', err);
  }

  return message.reply(`✅ Removed ${rawEmoji} mapping from panel \`${messageId}\`.`);
}

async function handleList(message, args) {
  // ,rr list <messageId>
  const [messageId] = args;
  if (!messageId)
    return message.reply('Usage: `,rr list <messageId>`');

  const doc = await ReactionRole.findOne({ guildId: message.guild.id, messageId });
  if (!doc) return message.reply('❌ No panel found for that message ID.');
  if (!doc.entries.length)
    return message.reply(`Panel \`${messageId}\` has no emoji→role mappings yet.`);

  const lines = doc.entries.map(e => {
    const role = message.guild.roles.cache.get(e.roleId);
    const emojiDisplay = /^\d+$/.test(e.emoji)
      ? (message.guild.emojis.cache.get(e.emoji) ? `<:_:${e.emoji}>` : `\`${e.emoji}\``)
      : e.emoji;
    return `${emojiDisplay} → ${role ? `<@&${role.id}>` : `\`${e.roleId}\` (deleted?)`}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`Reaction Roles — \`${messageId}\``)
    .setDescription(lines.join('\n'))
    .setColor(0x5865F2)
    .setFooter({ text: `Channel: ${doc.channelId}` });

  return message.reply({ embeds: [embed] });
}

async function handleClear(message, args) {
  // ,rr clear <messageId>
  const [messageId] = args;
  if (!messageId)
    return message.reply('Usage: `,rr clear <messageId>`');

  const doc = await ReactionRole.findOne({ guildId: message.guild.id, messageId });
  if (!doc) return message.reply('❌ No panel found for that message ID.');

  doc.entries = [];
  await doc.save();

  // Remove all bot reactions
  try {
    const target = await fetchPanelMessage(message.guild, doc.channelId, messageId);
    if (!target) throw new Error('Panel message not found');
    await target.reactions.removeAll();
  } catch (err) {
    console.error('RR clear reactions error:', err);
  }

  return message.reply(`✅ Cleared all mappings from panel \`${messageId}\`.`);
}

async function handleDelete(message, args) {
  // ,rr delete <messageId>  — removes from DB entirely
  const [messageId] = args;
  if (!messageId)
    return message.reply('Usage: `,rr delete <messageId>`');

  const doc = await ReactionRole.findOneAndDelete({ guildId: message.guild.id, messageId });
  if (!doc) return message.reply('❌ No panel found for that message ID.');

  try {
    const target = await fetchPanelMessage(message.guild, doc.channelId, messageId);
    if (target) await target.reactions.removeAll();
  } catch (_) {}

  return message.reply(`✅ Reaction-role panel \`${messageId}\` deleted from the database.`);
}

// ─── export ───────────────────────────────────────────────────────────────────

module.exports = {
  name: 'rr',
  aliases: ['reactionrole', 'reactionroles'],
  category: 'utility',
  description: 'Manage reaction-role panels',
  usage: ',rr <setup|create|add|remove|list|clear|delete> [args]',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply('❌ You need **V2** or higher to manage reaction roles.');

    const sub = (args[0] || '').toLowerCase();
    const rest = args.slice(1);

    switch (sub) {
      case 'setup':  return handleSetup(message, rest);
      case 'create': return handleCreate(message, rest);
      case 'add':    return handleAdd(message, rest);
      case 'remove': return handleRemove(message, rest);
      case 'list':   return handleList(message, rest);
      case 'clear':  return handleClear(message, rest);
      case 'delete': return handleDelete(message, rest);

      default:
        return message.reply(
          '**Reaction Role commands:**\n' +
          '`,rr create <#channel> <title> [desc]` — bot posts the panel\n' +
          '`,rr setup <#channel> <messageId>` — attach to an existing message\n' +
          '`,rr add <msgId> <emoji> <@role>` — add a mapping\n' +
          '`,rr remove <msgId> <emoji>` — remove a mapping\n' +
          '`,rr list <msgId>` — show all mappings\n' +
          '`,rr clear <msgId>` — remove all mappings\n' +
          '`,rr delete <msgId>` — remove panel from database'
        );
    }
  },
};
