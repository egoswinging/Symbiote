const { Schema, model, models } = require('mongoose');

// Use Mixed type for everything — no validation at all
// This is intentional: backup data can be complex and vary by Discord version
const backupSchema = new Schema({
  ownerId:   { type: String, required: true },
  name:      { type: String, required: true },
  savedAt:   { type: Date, default: Date.now },
  guildName: { type: String, default: 'Unknown' },
  guildId:   { type: String, default: null },
  roles:     { type: Schema.Types.Mixed, default: [] },
  channels:  { type: Schema.Types.Mixed, default: [] },
}, {
  strict: false,        // allow any extra fields
  validateBeforeSave: false,  // skip all validation on save
});

backupSchema.index({ ownerId: 1, name: 1 }, { unique: true });

module.exports = models.Backup || model('Backup', backupSchema);
