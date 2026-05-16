const { Schema, model, models } = require('mongoose');

// Tracks @everyone ping counts per user for rate limiting
const pingTrackSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  timestamps: { type: [Date], default: [] },
});

pingTrackSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.PingTrack || model('PingTrack', pingTrackSchema);
