const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { ActivityType } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

async function isInnerCircle(member) {
  if (isBotOwner(member.id)) return true;
  const UserData = require('../../models/UserData');
  const ud = await UserData.findOne({ guildId: member.guild.id, userId: member.id }).lean();
  return ud?.isInnerCircle === true;
}

async function silentReply(message, embed, delay = 4000) {
  await message.delete().catch(() => {});
  const reply = await message.channel.send({ embeds: [embed] });
  setTimeout(() => reply.delete().catch(() => {}), delay);
}

module.exports = [setavatar, serverav, serverbanner, ss, status];
