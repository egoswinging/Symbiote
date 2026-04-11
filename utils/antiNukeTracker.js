// In-memory action tracker: guildId → userId → { action: [timestamps] }
const tracker = new Map();

const WINDOW_MS = 10_000; // 10-second window

/**
 * Record an action for a user and check if threshold exceeded.
 * @returns {boolean} true if threshold exceeded
 */
function trackAction(guildId, userId, action, limit) {
  const gKey = `${guildId}:${userId}:${action}`;
  const now = Date.now();

  if (!tracker.has(gKey)) tracker.set(gKey, []);

  // Remove old timestamps outside window
  const times = tracker.get(gKey).filter(t => now - t < WINDOW_MS);
  times.push(now);
  tracker.set(gKey, times);

  // Auto-cleanup after window
  setTimeout(() => {
    const updated = (tracker.get(gKey) || []).filter(t => Date.now() - t < WINDOW_MS);
    if (updated.length === 0) tracker.delete(gKey);
    else tracker.set(gKey, updated);
  }, WINDOW_MS);

  return times.length >= limit;
}

/**
 * Clear action history for a user (after punishment).
 */
function clearTracker(guildId, userId) {
  for (const [key] of tracker) {
    if (key.startsWith(`${guildId}:${userId}:`)) tracker.delete(key);
  }
}

module.exports = { trackAction, clearTracker };
