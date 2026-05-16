const { requireTier, canTarget } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const { logAction } = require('../../utils/logger');
const UserData = require('../../models/UserData');

async function silentReply(message, embed, delay = 3000) {
  await message.delete().catch(() => {});
  const reply = await message.channel.send({ embeds: [embed] });
  setTimeout(() => reply.delete().catch(() => {}), delay);
}

const shush = {
  name: 'shush',
  category: 'moderation',
  description: 'Auto-delete all future messages from a user',
  usage: '.shush @user',
  example: '.shush @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    if (!await canTarget(message.member, target, config))
      return message.reply({ embeds: [errorEmbed('You cannot target someone with equal or higher permissions.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isShushed: true },
      { upsert: true }
    );

    await logAction(message.guild, { action: 'Shush', moderator: message.author.id, target: target.id, reason: 'Messages will be auto-deleted' });
    await silentReply(message, successEmbed(`${target} has been **shushed**.`));
  },
};

const unshush = {
  name: 'unshush',
  category: 'moderation',
  description: 'Stop auto-deleting messages from a shushed user',
  usage: '.unshush @user',
  example: '.unshush @John',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    await UserData.findOneAndUpdate(
      { guildId: message.guild.id, userId: target.id },
      { isShushed: false }
    );

    await silentReply(message, successEmbed(`${target} has been **unshushed**.`));
  },
};

module.exports = [shush, unshush];
