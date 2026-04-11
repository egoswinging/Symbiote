const { Schema, model, models } = require('mongoose');

const backupSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  channels: [{
    name:       String,
    type:       Number,
    position:   Number,
    parentId:   String,
    topic:      String,
    nsfw:       Boolean,
    rateLimitPerUser: Number,
    permissionOverwrites: [{
      id:    String,
      type:  Number,  // 0=role, 1=member
      allow: String,
      deny:  String,
    }],
  }],

  roles: [{
    name:        String,
    color:       Number,
    hoist:       Boolean,
    position:    Number,
    permissions: String,
    mentionable: Boolean,
  }],

  savedAt: { type: Date, default: Date.now },
});

module.exports = models.Backup || model('Backup', backupSchema);
