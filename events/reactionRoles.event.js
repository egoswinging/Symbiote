const ReactionRole = require('../models/ReactionRole');

async function resolveReaction(reaction, user) {
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return false; }
  }
  if (user.partial) {
    try { await user.fetch(); } catch { return false; }
  }
  return true;
}

function emojiKey(emoji) {
  return emoji.id || emoji.name;
}

async function findEntry(reaction, user) {
  if (user.bot) return null;
  if (!await resolveReaction(reaction, user)) return null;
  if (!reaction.message.guild) return null;

  const doc = await ReactionRole.findOne({
    guildId: reaction.message.guild.id,
    messageId: reaction.message.id,
  }).lean();

  if (!doc?.entries?.length) return null;

  const key = emojiKey(reaction.emoji);
  const entry = doc.entries.find(item => item.emoji === key);
  if (!entry) return null;

  return { guild: reaction.message.guild, entry };
}

async function handleReactionAdd(reaction, user) {
  const found = await findEntry(reaction, user);
  if (!found) return;

  const { guild, entry } = found;

  try {
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(entry.roleId);
    if (!role || member.roles.cache.has(role.id)) return;
    if (role.position >= guild.members.me.roles.highest.position) return;

    await member.roles.add(role, 'Reaction role');
  } catch (err) {
    console.error('RR add role error:', err);
  }
}

async function handleReactionRemove(reaction, user) {
  const found = await findEntry(reaction, user);
  if (!found) return;

  const { guild, entry } = found;

  try {
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(entry.roleId);
    if (!role || !member.roles.cache.has(role.id)) return;
    if (role.position >= guild.members.me.roles.highest.position) return;

    await member.roles.remove(role, 'Reaction role removed');
  } catch (err) {
    console.error('RR remove role error:', err);
  }
}

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
