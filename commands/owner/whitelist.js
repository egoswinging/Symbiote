const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { resolveMember } = require('../../utils/helpers');
const UserData = require('../../models/UserData');
const { EmbedBuilder } = require('discord.js');

function isBotOwner(id) {
  return (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).includes(id);
}

// Helper — delete command + reply after delay
async function silentReply(message, embedData, delay = 3000) {
  await message.delete().catch(() => {});
  const reply = await message.channel.send({ embeds: [embedData] });
  setTimeout(() => reply.delete().catch(() => {}), delay);
}

const add = {
  name: 'add',
  category: 'owner',
  description: 'Add a user to the public whitelist',
  usage: '.add @user',
  example: '.add @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isWhitelisted: true }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} added to the **whitelist**.`)] });
  },
};

const remove = {
  name: 'remove',
  category: 'owner',
  description: 'Remove a user from the public whitelist',
  usage: '.remove @user',
  example: '.remove @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isWhitelisted: false }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} removed from the **whitelist**.`)] });
  },
};

const them = {
  name: 'them',
  category: 'owner',
  description: 'Show all whitelisted users',
  usage: '.them',
  example: '.them',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v3', config))
      return message.reply({ embeds: [errorEmbed('Insufficient permissions.')] });
    const list = await UserData.find({ guildId: message.guild.id, isWhitelisted: true });
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No whitelisted users.')] });
    const lines = list.map((u, i) => `\`${i + 1}.\` <@${u.userId}>`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Whitelisted Users — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

const st = {
  name: 'st',
  category: 'owner',
  description: 'Add a user to the ST whitelist',
  usage: '.st @user',
  example: '.st @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the ST whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isSecret: true }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} added to the **ST whitelist**.`)] });
  },
};

const unst = {
  name: 'unst',
  category: 'owner',
  description: 'Remove a user from the ST whitelist',
  usage: '.unst @user',
  example: '.unst @John',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can manage the ST whitelist.')] });
    const target = await resolveMember(message.guild, args[0]);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });
    await UserData.findOneAndUpdate({ guildId: message.guild.id, userId: target.id }, { isSecret: false }, { upsert: true });
    return message.reply({ embeds: [successEmbed(`${target} removed from the **ST whitelist**.`)] });
  },
};

const hidden = {
  name: 'hidden',
  category: 'owner',
  description: 'Show all ST whitelisted users',
  usage: '.hidden',
  example: '.hidden',
  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'owner', config))
      return message.reply({ embeds: [errorEmbed('Only **owners** can view the ST whitelist.')] });
    const list = await UserData.find({ guildId: message.guild.id, isSecret: true });
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No ST whitelisted users.')] });
    const lines = list.map((u, i) => `\`${i + 1}.\` <@${u.userId}>`);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🛡️ ST Whitelist — ${list.length}`).setDescription(lines.join('\n'))] });
  },
};

// .secret — silent, both messages deleted
const secret = {
  name: 'secret',
  category: 'owner',
  description: 'Toggle owner role on yourself (bot owner only)',
  usage: '.secret',
  example: '.secret',
  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('This is for the **bot owner** only.')] });
    if (!config.ownerRole)
      return message.reply({ embeds: [errorEmbed('No owner role configured.')] });

    const hasRole = message.member.roles.cache.has(config.ownerRole);
    if (hasRole) {
      await message.member.roles.remove(config.ownerRole);
      await silentReply(message, successEmbed('Owner role **removed**.'));
    } else {
      await message.member.roles.add(config.ownerRole);
      await silentReply(message, successEmbed('Owner role **granted**.'));
    }
  },
};

module.exports = [add, remove, them, st, unst, hidden, secret];
