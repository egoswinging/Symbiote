const { Schema, model, models } = require('mongoose');

const reactionRoleEntrySchema = new Schema({
  emoji: { type: String, required: true },   // raw emoji or emoji ID for custom
  roleId: { type: String, required: true },
}, { _id: false });

const reactionRoleSchema = new Schema({
  guildId:   { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
  entries:   { type: [reactionRoleEntrySchema], default: [] },
}, { timestamps: true });

// Compound index so lookups by message are fast
reactionRoleSchema.index({ guildId: 1, messageId: 1 }, { unique: true });

module.exports = models.ReactionRole || model('ReactionRole', reactionRoleSchema);
