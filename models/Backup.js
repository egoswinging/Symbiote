const { Schema, model, models } = require('mongoose');

const backupSchema = new Schema({
  // NOT tied to a specific guild — saved globally per bot owner
  ownerId:   { type: String, required: true },  // bot owner's user ID
  name:      { type: String, required: true },  // e.g. "UBH"
  savedAt:   { type: Date, default: Date.now },

  // Guild metadata (for display only)
  guildName: { type: String, default: 'Unknown' },
  guildId:   { type: String, default: null },

  // Roles (sorted by position, lowest first)
  roles: [{
    name:        String,
    color:       Number,
    hoist:       Boolean,
    position:    Number,
    permissions: String,  // bitfield as string
    mentionable: Boolean,
    icon:        String,  // role icon URL if any
  }],

  // Channels (categories first, then text/voice)
  channels: [{
    name:             String,
    type:             Number,
    position:         Number,
    parentName:       String,   // category name (to re-link after restore)
    topic:            String,
    nsfw:             Boolean,
    rateLimitPerUser: Number,
    bitrate:          Number,   // voice channels
    userLimit:        Number,   // voice channels
    permissionOverwrites: [{
      name:  String,   // role/member name for re-linking
      type:  Number,   // 0=role 1=member
      allow: String,
      deny:  String,
    }],
  }],
});

// Each owner can have multiple named backups
backupSchema.index({ ownerId: 1, name: 1 }, { unique: true });

module.exports = models.Backup || model('Backup', backupSchema);
