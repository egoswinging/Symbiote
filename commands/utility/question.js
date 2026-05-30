const { EmbedBuilder } = require('discord.js');

const PREFIX = process.env.PREFIX || '.';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 8000;
const GEMINI_FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

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
    summary: 'Creates and manages reaction-role panels. Setup flow: `.rr create #channel Title Description`, copy the message ID it gives you, then run `.rr add messageId emoji @role` for each role.',
    usage: '.rr create #roles Roles Pick your roles',
  },
  click: {
    summary: 'Perma-bans a user. If they rejoin, the bot auto-rebans them.',
    usage: '.click @user reason',
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
  nuke: {
    summary: 'Clones the current channel and deletes the old one, basically remaking the channel.',
    usage: '.nuke',
  },
  clean: {
    summary: 'Toggles clean mode so normal messages in that channel get auto-deleted.',
    usage: '.clean',
  },
};

const ANSWERS = [
  {
    terms: ['ban', 'wipe', 'remove from server'],
    command: 'wipe',
    answer: 'Use `.wipe @user reason` to ban someone. Use `.unwipe userId` to unban them.',
  },
  {
    terms: ['auto reban', 'auto-reban', 'auto rebans', 'auto-rebans', 'rebans if they rejoin', 'rejoin ban', 'perma ban', 'permaban', 'click'],
    command: 'click',
    answer: 'Use `.click @user reason`. That is the perma-ban command: if they rejoin, the bot auto-rebans them.',
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
    terms: ['delete channel and remake', 'deletes and remakes a channel', 'clone channel', 'remake channel', 'nuke channel', 'reset channel'],
    command: 'nuke',
    answer: 'Use `.nuke` in the channel. It clones the current channel and deletes the old one.',
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
    terms: ['reaction role', 'reaction roles', 'react role', 'reactionroles'],
    command: 'rr',
    answer: 'Reaction role setup: run `.rr create #roles Roles Pick your roles`, copy the message ID the bot replies with, then run `.rr add messageId emoji @role`. Example: `.rr add 123456789012345678 ✅ @Member`.',
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
  const rawWords = input
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);

  const prefixed = rawWords
    .filter(word => word.startsWith(PREFIX))
    .map(cleanCommandName)
    .find(word => client.commands.has(word) || COMMAND_DETAILS[word]);
  if (prefixed) return client.commands.get(prefixed)?.name || prefixed;

  const text = input.toLowerCase();
  const directMatch = text.match(/\b(?:what\s+does|explain|usage\s+for|how\s+do\s+i\s+use)\s+\.?([a-z0-9]+)/i);
  const asked = directMatch ? cleanCommandName(directMatch[1]) : null;
  if (asked && asked.length > 2 && (client.commands.has(asked) || COMMAND_DETAILS[asked])) {
    return client.commands.get(asked)?.name || asked;
  }

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

function uniqueCommands(client) {
  const seen = new Set();
  const commands = [];

  for (const [key, command] of client.commands) {
    const name = command?.name || key;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const detail = COMMAND_DETAILS[name] || {};
    commands.push({
      name,
      aliases: command?.aliases || [],
      summary: detail.summary || command?.description || 'No description saved.',
      usage: detail.usage || command?.usage || `${PREFIX}${name}`,
    });
  }

  for (const [name, detail] of Object.entries(COMMAND_DETAILS)) {
    if (seen.has(name)) continue;
    commands.push({ name, aliases: [], summary: detail.summary, usage: detail.usage });
  }

  return commands;
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function askGemini(question, client) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const commands = uniqueCommands(client);
  const prompt = [
    'You are a Discord bot command helper for the bot named Symbiote.',
    'Answer the user by choosing the single best command from the provided command list.',
    'Do not invent commands. If nothing fits, use command null.',
    'Return ONLY valid JSON with: command, answer, usage.',
    'Keep the answer short and practical.',
    '',
    `Prefix: ${PREFIX}`,
    `Commands: ${JSON.stringify(commands)}`,
    `User question: ${question}`,
  ].join('\n');

  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(Boolean))];

  for (const model of models) {
    for (const jsonMode of [true, false]) {
      const result = await callGemini(apiKey, model, prompt, jsonMode);
      if (!result.ok) {
        console.warn(`[question/gemini] ${model} failed: ${result.status || ''} ${result.error || ''}`.trim());
        continue;
      }

      const parsed = extractJson(result.text);
      if (!parsed?.answer) continue;

      const commandName = parsed.command ? cleanCommandName(parsed.command) : null;
      if (commandName && !client.commands.has(commandName) && !COMMAND_DETAILS[commandName]) continue;

      return {
        command: commandName,
        answer: String(parsed.answer).slice(0, 900),
        usage: parsed.usage ? String(parsed.usage).slice(0, 200) : null,
      };
    }
  }

  return null;
}

async function callGemini(apiKey, model, prompt, jsonMode = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const generationConfig = {
      temperature: 0.1,
      maxOutputTokens: 220,
    };
    if (jsonMode) generationConfig.responseMimeType = 'application/json';

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: body.slice(0, 240) };
    }

    const data = JSON.parse(body);
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n');
    return { ok: Boolean(text), text, model };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function geminiStatus() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { ok: false, message: '`GEMINI_API_KEY` is not loaded in this Railway service.' };
  }

  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(Boolean))];
  for (const model of models) {
    const result = await callGemini(
      apiKey,
      model,
      'Return ONLY this JSON: {"command":"question","answer":"Gemini is connected.","usage":".question how do I ban someone"}',
      true,
    );
    if (result.ok) return { ok: true, message: `Gemini is connected with \`${model}\`.` };
  }

  return { ok: false, message: 'Gemini key is loaded, but Google rejected the test. Check Railway logs for `[question/gemini]` errors.' };
}

function buildAnswerEmbed(title, answer, commandName, client, usage = null) {
  const command = commandName ? client.commands.get(commandName) : null;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(title)
    .setDescription(answer);

  if (commandName) {
    embed.addFields(
      { name: 'Best match', value: `\`${PREFIX}${commandName}\``, inline: true },
      { name: 'More info', value: `\`${PREFIX}help ${commandName}\``, inline: true },
    );
  }

  if (usage) {
    embed.addFields({ name: 'Usage', value: `\`${usage}\``, inline: false });
  }

  if (command?.aliases?.length) {
    embed.addFields({ name: 'Aliases', value: command.aliases.map(alias => `\`${PREFIX}${alias}\``).join(', '), inline: false });
  }

  return embed;
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

    if (/^(ai\s*)?status$|^gemini\s*(status|test)$|^ai\s*test$/i.test(question)) {
      const status = await geminiStatus();
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(status.ok ? 0x57F287 : 0xED4245)
          .setTitle('Question AI Status')
          .setDescription(status.message)],
      });
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

    const aiAnswer = await askGemini(question, client);
    if (aiAnswer) {
      return message.reply({
        embeds: [buildAnswerEmbed('Command Finder', aiAnswer.answer, aiAnswer.command, client, aiAnswer.usage)],
      });
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
