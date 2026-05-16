const { Events, ActivityType } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    client.user.setPresence({
      activities: [{ name: `${process.env.PREFIX || '.'}help | moderation bot`, type: ActivityType.Watching }],
      status: 'dnd',
    });

    // Load clean channels into memory
    try {
      const allConfigs = await GuildConfig.find({ 'cleanChannels.0': { $exists: true } });
      for (const cfg of allConfigs) {
        for (const chId of cfg.cleanChannels) client.cleanChannels.add(chId);
      }
      console.log(`✅ Loaded ${client.cleanChannels.size} clean channels`);
    } catch (err) {
      console.error('Failed to load clean channels:', err.message);
    }
  },
};
