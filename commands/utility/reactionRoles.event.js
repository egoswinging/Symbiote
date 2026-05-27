/**
 * reactionRoles.js  —  event handler file
 * 
 * Handles both messageReactionAdd and messageReactionRemove.
 * Drop this file into your events/ folder.
 * Your eventHandler must load it — it exports an array of two event objects.
 */

const ReactionRole = require('../models/ReactionRole');

/** Resolve partial structures that Discord.js gives us for uncached messages */
async function resolveReaction(reaction, user) {
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return null; }
  }
  if (user.partial) {
    try { await user.fetch(); } catch { return null; }
  }
  return true;
}

/** Given a raw emoji object, return the stored key (id for custom, name for unicode) */
function emojiKey(emoji) {
  return emoji.id || emoji.name;
}

async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  if (!reaction.message.guild) return; // DM — skip
  if (!await resolveReaction(reaction, user)) return;

  const { guild } = reaction.message;

  const doc = await ReactionRole.findOne({
    guildId: guild.id,
    messageId: reaction.message.id,
  });
  if (!doc || !doc.entries.length) return;

  const key = emojiKey(reaction.emoji);
  const entry = doc.entries.find(e => e.emoji === key);
  if (!entry) return;

  try {
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(entry.roleId);
    if (!role) return;

    // Check bot hierarchy before attempting
    if (role.position >= guild.members.me.roles.highest.position) return;

    await member.roles.add(role, 'Reaction role');
  } catch (err) {
    console.error('RR add role error:', err);
  }
}

async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (!reaction.message.guild) return;
  if (!await resolveReaction(reaction, user)) return;

  const { guild } = reaction.message;

  const doc = await ReactionRole.findOne({
    guildId: guild.id,
    messageId: reaction.message.id,
  });
  if (!doc || !doc.entries.length) return;

  const key = emojiKey(reaction.emoji);
  const entry = doc.entries.find(e => e.emoji === key);
  if (!entry) return;

  try {
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(entry.roleId);
    if (!role) return;

    if (role.position >= guild.members.me.roles.highest.position) return;

    await member.roles.remove(role, 'Reaction role removed');
  } catch (err) {
    console.error('RR remove role error:', err);
  }
}

// Export array so your eventHandler can load both from one file
module.exports = [
  {
    name: 'messageReactionAdd',
    execute: handleReactionAdd,
  },
  {
    name: 'messageReactionRemove',
    execute: handleReactionRemove,
  },
];
