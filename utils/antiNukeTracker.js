const tracker = new Map();
const WINDOW_MS = 10_000;

function trackAction(guildId, userId, action, limit) {
  const gKey = `${guildId}:${userId}:${action}`;
  const now  = Date.now();

  if (!tracker.has(gKey)) tracker.set(gKey, []);
  const times = tracker.get(gKey).filter(t => now - t < WINDOW_MS);
  times.push(now);
  tracker.set(gKey, times);

  setTimeout(() => {
    const updated = (tracker.get(gKey) || []).filter(t => Date.now() - t < WINDOW_MS);
    if (!updated.length) tracker.delete(gKey);
    else tracker.set(gKey, updated);
  }, WINDOW_MS);

  return times.length >= limit;
}

function clearTracker(guildId, userId) {
  for (const [key] of tracker) {
    if (key.startsWith(`${guildId}:${userId}:`)) tracker.delete(key);
  }
}

module.exports = { trackAction, clearTracker };
