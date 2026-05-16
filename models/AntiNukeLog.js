const { Schema, model, models } = require('mongoose');

// Tracks action counts per user for anti-nuke
// In-memory Map is faster; this is for audit logging
const antiNukeLogSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  action:    { type: String, required: true }, // channelDelete, roleDelete, ban, kick
  target:    { type: String },
  timestamp: { type: Date, default: Date.now },
});

antiNukeLogSchema.index({ guildId: 1, timestamp: 1 });

module.exports = models.AntiNukeLog || model('AntiNukeLog', antiNukeLogSchema);
