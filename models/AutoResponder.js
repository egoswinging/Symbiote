const { Schema, model, models } = require('mongoose');

const autoResponderSchema = new Schema({
  guildId:  { type: String, required: true },
  trigger:  { type: String, required: true },
  response: { type: String, required: true },
}, { timestamps: true });

autoResponderSchema.index({ guildId: 1, trigger: 1 }, { unique: true });

module.exports = models.AutoResponder || model('AutoResponder', autoResponderSchema);
