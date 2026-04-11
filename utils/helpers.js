/**
 * Resolve a member from a string (mention, ID, username, tag).
 * @param {import('discord.js').Guild} guild
 * @param {string} query
 * @returns {Promise<import('discord.js').GuildMember|null>}
 */
async function resolveMember(guild, query) {
  if (!query) return null;

  // Strip mention syntax
  const id = query.replace(/[<@!>]/g, '');

  // Try cache by ID first
  if (/^\d{17,20}$/.test(id)) {
    const cached = guild.members.cache.get(id);
    if (cached) return cached;
    return guild.members.fetch(id).catch(() => null);
  }

  // Search by username / displayName
  await guild.members.fetch({ query, limit: 5 }).catch(() => {});
  return guild.members.cache.find(m =>
    m.user.username.toLowerCase() === query.toLowerCase() ||
    m.displayName.toLowerCase() === query.toLowerCase()
  ) || null;
}

/**
 * Resolve a role from mention, ID, or name.
 */
function resolveRole(guild, query) {
  if (!query) return null;
  const id = query.replace(/[<@&>]/g, '');
  return guild.roles.cache.get(id) ||
    guild.roles.cache.find(r => r.name.toLowerCase() === query.toLowerCase()) ||
    null;
}

/**
 * Chunk an array into pages.
 * @param {any[]} arr
 * @param {number} size
 */
function chunk(arr, size) {
  const pages = [];
  for (let i = 0; i < arr.length; i += size) {
    pages.push(arr.slice(i, i + size));
  }
  return pages;
}

/**
 * Check and enforce a cooldown.
 * @param {Collection} cooldowns
 * @param {string} commandName
 * @param {string} userId
 * @param {number} seconds
 * @returns {number|null} remaining seconds if on cooldown, null if ok
 */
function checkCooldown(cooldowns, commandName, userId, seconds) {
  const key = `${commandName}:${userId}`;
  const now = Date.now();
  if (cooldowns.has(key)) {
    const exp = cooldowns.get(key);
    if (now < exp) return Math.ceil((exp - now) / 1000);
  }
  cooldowns.set(key, now + seconds * 1000);
  setTimeout(() => cooldowns.delete(key), seconds * 1000);
  return null;
}

/**
 * Bulk delete messages safely (Discord limit: 100, max 14 days old).
 */
async function bulkDelete(channel, amount) {
  const fetched = await channel.messages.fetch({ limit: Math.min(amount, 100) });
  const deletable = fetched.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
  if (deletable.size === 0) return 0;
  await channel.bulkDelete(deletable, true);
  return deletable.size;
}

module.exports = { resolveMember, resolveRole, chunk, checkCooldown, bulkDelete };
