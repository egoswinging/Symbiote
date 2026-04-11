const fs = require('fs');
const path = require('path');

/**
 * Load all event files from /events directory.
 * Each file exports: { name, once?, execute }
 */
function registerEvent(client, event) {
  if (!event.name) return false;
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  return true;
}

function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const files = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  let loaded = 0;

  for (const file of files) {
    try {
      const exported = require(path.join(eventsPath, file));

      // Support both single export and named exports (e.g. antiNuke.js)
      if (exported.name) {
        if (registerEvent(client, exported)) loaded++;
      } else {
        for (const key of Object.keys(exported)) {
          if (registerEvent(client, exported[key])) loaded++;
        }
      }
    } catch (err) {
      console.error(`❌ Failed to load event ${file}:`, err.message);
    }
  }

  console.log(`✅ Loaded ${loaded} events`);
}

module.exports = { loadEvents };
