require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const mongoose = require('mongoose');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

// Collections
client.commands = new Collection();        // prefix commands
client.slashCommands = new Collection();   // slash commands
client.cooldowns = new Collection();       // cooldown tracking
client.snipes = new Collection();          // sniped messages per channel
client.cleanChannels = new Set();          // active clean-mode channels (loaded from DB on ready)
client.j2cOwners = new Map();             // voiceChannelId → userId

// Load handlers
loadCommands(client);
loadEvents(client);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { dbName: 'discordbot' })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Login
client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});

// Global error handlers — prevent crashes
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));
