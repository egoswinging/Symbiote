const { Schema, model, models } = require('mongoose');

const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  ownerRole:  { type: String, default: null },
  vanishRole: { type: String, default: null },
  accessRole: { type: String, default: null },

  v1Roles: { type: [String], default: [] },
  v2Roles: { type: [String], default: [] },
  v3Roles: { type: [String], default: [] },

  logChannel:          { type: String, default: null },
  deleteEditChannel:   { type: String, default: null },
  welcomeChannel:      { type: String, default: null },

  antiNuke: {
    enabled:         { type: Boolean, default: false },
    thresholds: {
      channelDelete: { type: Number, default: 3 },
      roleDelete:    { type: Number, default: 3 },
      ban:           { type: Number, default: 3 },
      kick:          { type: Number, default: 5 },
      spam:          { type: Number, default: 5 },
    },
    timeoutDuration: { type: Number, default: 60 },
    punishment:      { type: String, enum: ['removeRoles', 'kick', 'ban', 'vanish', 'timeout'], default: 'removeRoles' },
    punishments: {
      channelDelete: { type: String, default: null },
      roleDelete:    { type: String, default: null },
      ban:           { type: String, default: null },
      kick:          { type: String, default: null },
      spam:          { type: String, default: null },
    },
    blockUserApps: { type: Boolean, default: true },
    whitelist:     { type: [String], default: [] },
  },

  j2cChannel:       { type: String, default: null },
  j2cCategory:      { type: String, default: null },
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
  secretWhitelist:   { type: [String], default: [] }, // users allowed to use .secret

  // Promotion system
  // Ordered list of role IDs from LOWEST to HIGHEST rank
  promotionRoles:    { type: [String], default: [] },
  // Roles that are immune to deletion during promotion
  promotionProtectedRoles: { type: [String], default: [] },

}, { timestamps: true });

module.exports = models.GuildConfig || model('GuildConfig', guildConfigSchema);