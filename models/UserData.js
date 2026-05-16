const { Schema, model, models } = require('mongoose');

const userDataSchema = new Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },

  isWiped:        { type: Boolean, default: false },  // banned
  isVanished:     { type: Boolean, default: false },
  isBlacklisted:  { type: Boolean, default: false },
  isWhitelisted:  { type: Boolean, default: false },  // .add whitelist
  isSecret:       { type: Boolean, default: false },  // .st whitelist
  isInnerCircle:  { type: Boolean, default: false },  // .innercircle — full control
  isClicked:      { type: Boolean, default: false },  // .click — permaban, reban on rejoin
  isShushed:      { type: Boolean, default: false },  // .shush — delete all messages

  savedRoles:    { type: [String], default: [] },
  vanishedRoles: { type: [String], default: [] },

  forcedNick: { type: String, default: null },

  punishments: [{
    type:      { type: String },
    reason:    { type: String },
    moderator: { type: String },
    timestamp: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

userDataSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = models.UserData || model('UserData', userDataSchema);
