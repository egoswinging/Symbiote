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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
  ],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

client.commands     = new Collection();
client.slashCommands = new Collection();
client.cooldowns    = new Collection();
client.snipes       = new Collection();
client.cleanChannels = new Set();
client.j2cOwners    = new Map();

loadCommands(client);
loadEvents(client);

mongoose.connect(process.env.MONGO_URI, { dbName: 'discordbot' })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException',  err => console.error('Uncaught exception:', err));
