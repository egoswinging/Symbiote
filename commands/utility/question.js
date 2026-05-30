const { EmbedBuilder } = require('discord.js');

const PREFIX = process.env.PREFIX || '.';

const COMMAND_DETAILS = {
  wipe: {
    summary: 'Bans a user from the server and stores them in the wipe list.',
    usage: '.wipe @user reason',
  },
  unwipe: {
    summary: 'Unbans a wiped user by their Discord user ID.',
    usage: '.unwipe 123456789012345678',
  },
  unwipeall: {
    summary: 'Unbans everyone currently tracked by the wipe list.',
    usage: '.unwipeall',
  },
  vanish: {
    summary: 'Removes a member roles and applies the vanish role.',
    usage: '.vanish @user reason',
  },
  restorevanish: {
    summary: 'Gives a vanished member their saved roles back.',
    usage: '.restorevanish @user',
  },
  restore: {
    summary: 'Restores saved roles to a member.',
    usage: '.restore @user',
  },
  timeout: {
    summary: 'Times a member out for a duration like 10m, 2h, or 1d.',
    usage: '.timeout @user 30m reason',
  },
  untimeout: {
    summary: 'Removes a timeout from a member.',
    usage: '.untimeout @user reason',
  },
  kick: {
    summary: 'Kicks a member without banning them.',
    usage: '.kick @user reason',
  },
  removeall: {
    summary: 'Removes one role from every member who has it.',
    usage: '.removeall @role',
  },
  role: {
    summary: 'Gives, removes, or creates roles.',
    usage: '.role give @user @role',
  },
  automod: {
    summary: 'Manages blocked words, blocked links, automod logs, and automod on/off.',
    usage: '.automod add word badword',
  },
  rr: {
    summary: 'Creates and manages reaction-role panels.',
    usage: '.rr create #roles Roles Pick your roles',
  },
  question: {
    summary: 'Answers private command questions and explains what commands do.',
    usage: '.question what does wipe do?',
  },
  s: {
    summary: 'Shows a recently deleted message in the current channel.',
    usage: '.s',
  },
  cs: {
    summary: 'Clears the saved snipe for the current channel.',
    usage: '.cs',
  },
  saveserver: {
    summary: 'Saves the current server layout as a named backup.',
    usage: '.saveserver name',
  },
  serverload: {
    summary: 'Wipes the server layout and restores a saved server backup.',
    usage: '.serverload name',
  },
  antinuke: {
    summary: 'Configures anti-nuke triggers like mass ban, kick, channel delete, role delete, and spam.',
    usage: '.an config',
  },
};

const ANSWERS = [
  {
    terms: ['ban', 'wipe', 'remove from server'],
    command: 'wipe',
    answer: 'Use `.wipe @user reason` to ban someone. Use `.unwipe userId` to unban them.',
  },
  {
    terms: ['unban', 'unwipe', 'bring back'],
    command: 'unwipe',
    answer: 'Use `.unwipe userId` to unban one person, or `.unwipeall` to clear the wipe list.',
  },
  {
    terms: ['kick'],
    command: 'kick',
    answer: 'Use `.kick @user reason` to kick someone without banning them.',
  },
  {
    terms: ['timeout', 'mute', 'shut up'],
    command: 'timeout',
    answer: 'Use `.timeout @user 30m reason`. You can use durations like `10m`, `2h`, or `1d`.',
  },
  {
    terms: ['untimeout', 'unmute', 'remove timeout'],
    command: 'untimeout',
    answer: 'Use `.untimeout @user reason` to remove their timeout.',
  },
  {
    terms: ['remove role from everybody', 'remove role from everyone', 'take role from everyone', 'take a role from everybody'],
    command: 'removeall',
    answer: 'Use `.removeall @role` to remove that role from every member who has it.',
  },
  {
    terms: ['give role', 'add role', 'remove role from user'],
    command: 'role',
    answer: 'Use `.role give @user @role` or `.role remove @user @role`.',
  },
  {
    terms: ['vanish', 'hide user'],
    command: 'vanish',
    answer: 'Use `.vanish @user reason` to remove their roles and give the vanish role. Use `.restorevanish @user` to restore saved roles.',
  },
  {
    terms: ['restore roles', 'roles back', 'restorevanish'],
    command: 'restorevanish',
    answer: 'Use `.restorevanish @user` for vanished users, or `.restore @user` for wiped/role backup restores.',
  },
  {
    terms: ['snipe', 'deleted message'],
    command: 's',
    answer: 'Use `.s` to show the latest deleted message, or `.s 2` for an older one.',
  },
  {
    terms: ['clear snipe', 'clear snipes'],
    command: 'cs',
    answer: 'Use `.cs` or `.clears` to clear the saved snipe in the current channel.',
  },
  {
    terms: ['automod', 'blocked word', 'bad word', 'filter words'],
    command: 'automod',
    answer: 'Use `.automod add word badword`, `.automod remove word badword`, `.automod list`, and `.automod enable`.',
  },
  {
    terms: ['reaction role', 'reaction roles', 'react role'],
    command: 'rr',
    answer: 'Use `.rr create #channel Title Description`, then `.rr add messageId emoji @role`.',
  },
  {
    terms: ['save server', 'backup server'],
    command: 'saveserver',
    answer: 'Use `.saveserver name` to save the layout. Use `.serverload name` to restore it.',
  },
  {
    terms: ['antinuke', 'anti nuke', 'mass ban', 'mass kick'],
    command: 'antinuke',
    answer: 'Use `.an config` to view settings, `.an set ban ban 3`, `.an set kick ban 3`, and `.an timeout spam 10m`.',
  },
];

function scoreQuestion(input, answer) {
  const text = input.toLowerCase();
  let score = 0;

  for (const term of answer.terms) {
    if (text.includes(term)) score += term.length + 10;
  }

  for (const word of text.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (answer.terms.some(term => term.includes(word))) score += Math.min(word.length, 6);
  }

  return score;
}

function cleanCommandName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(new RegExp(`^\\${PREFIX}`), '')
    .replace(/[^a-z0-9]/g, '');
}

function findAskedCommand(input, client) {
  const words = input
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .map(cleanCommandName)
    .filter(Boolean);

  const asked = words.find(word => client.commands.has(word) || COMMAND_DETAILS[word]);
  if (asked) return client.commands.get(asked)?.name || asked;

  return null;
}

function commandDetails(commandName, client) {
  const command = client.commands.get(commandName);
  const canonical = command?.name || commandName;
  const detail = COMMAND_DETAILS[canonical] || COMMAND_DETAILS[commandName] || {};

  return {
    name: canonical,
    summary: detail.summary || command?.description || 'No description saved for this command yet.',
    usage: detail.usage || command?.usage || `${PREFIX}${canonical}`,
    aliases: command?.aliases || [],
  };
}

module.exports = {
  name: 'question',
  aliases: ['q'],
  category: 'utility',
  description: 'Ask what command to use in plain English',
  usage: '.question <what do you want to do?>',
  example: '.question how do I ban people?',

  async execute(message, args, client) {
    const question = args.join(' ').trim();
    if (!question) {
      return message.reply(`Ask me what you want to do, like \`${PREFIX}question how do I ban people?\` or \`${PREFIX}question what does wipe do?\``);
    }

    const askedCommand = findAskedCommand(question, client);
    if (askedCommand && /\b(what|does|do|explain|mean|usage|how)\b/i.test(question)) {
      const detail = commandDetails(askedCommand, client);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Command: ${PREFIX}${detail.name}`)
        .setDescription(detail.summary)
        .addFields(
          { name: 'Usage', value: `\`${detail.usage}\``, inline: false },
          { name: 'More info', value: `\`${PREFIX}help ${detail.name}\``, inline: true },
        );

      if (detail.aliases.length) {
        embed.addFields({ name: 'Aliases', value: detail.aliases.map(alias => `\`${PREFIX}${alias}\``).join(', '), inline: false });
      }

      return message.reply({ embeds: [embed] });
    }

    const best = ANSWERS
      .map(answer => ({ ...answer, score: scoreQuestion(question, answer) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score <= 0) {
      return message.reply(`I could not match that yet. Try \`${PREFIX}help\` or \`${PREFIX}help <command>\`.`);
    }

    const command = client.commands.get(best.command);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Command Finder')
      .setDescription(best.answer)
      .addFields(
        { name: 'Best match', value: `\`${PREFIX}${best.command}\``, inline: true },
        { name: 'More info', value: `\`${PREFIX}help ${best.command}\``, inline: true },
      );

    if (command?.aliases?.length) {
      embed.addFields({ name: 'Aliases', value: command.aliases.map(alias => `\`${PREFIX}${alias}\``).join(', '), inline: false });
    }

    return message.reply({ embeds: [embed] });
  },
};
