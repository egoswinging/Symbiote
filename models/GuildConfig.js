const { Schema, model, models } = require('mongoose');

const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  ownerRole:  { type: String, default: null },
  vanishRole: { type: String, default: null },
  accessRole: { type: String, default: null },

  v1Roles: { type: [String], default: [] },
  v2Roles: { type: [String], default: [] },
  v3Roles: { type: [String], default: [] },

  logChannel:     { type: String, default: null }, // mod logs
  welcomeChannel: { type: String, default: null }, // join/leave messages

  antiNuke: {
    enabled:    { type: Boolean, default: false },
    thresholds: {
      channelDelete: { type: Number, default: 3 },
      roleDelete:    { type: Number, default: 3 },
      ban:           { type: Number, default: 3 },
      kick:          { type: Number, default: 5 },
    },
    punishment:  { type: String, enum: ['removeRoles', 'kick', 'ban', 'vanish'], default: 'removeRoles' },
    whitelist:   { type: [String], default: [] },
  },

  j2cChannel:  { type: String, default: null },
  j2cCategory: { type: String, default: null },

  cleanChannels:    { type: [String], default: [] },
  allowedPingRoles: { type: [String], default: [] },

  automod: {
    enabled:  { type: Boolean, default: false },
    words:    { type: [String], default: [] },
    links:    { type: [String], default: [] },
    channel:  { type: String, default: null },
  },

  adminPermsEnabled: { type: Boolean, default: true },
  savedRolePerms:    { type: String, default: '' },

}, { timestamps: true });

module.exports = models.GuildConfig || model('GuildConfig', guildConfigSchema);
