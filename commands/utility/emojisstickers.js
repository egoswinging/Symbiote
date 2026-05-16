const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

async function isInnerCircle(member) {
  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(member.id)) return true;
  const UserData = require('../../models/UserData');
  const ud = await UserData.findOne({ guildId: member.guild.id, userId: member.id }).lean();
  return ud?.isInnerCircle === true;
}

// Wait for user to reply with a name — returns the text or null on timeout
async function promptName(message, promptText) {
  const prompt = await message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(`${promptText}\n\nType the name now. You have **30 seconds**. Type \`cancel\` to abort.`)]
  });

  const filter = m => m.author.id === message.author.id;

  try {
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30_000, errors: ['time'] });
    const reply = collected.first();
    await prompt.delete().catch(() => {});
    await reply.delete().catch(() => {});

    if (reply.content.toLowerCase() === 'cancel') return null;
    return reply.content.trim().replace(/\s+/g, '_'); // Discord names can't have spaces
  } catch {
    await prompt.delete().catch(() => {});
    return null;
  }
}

// ── .swipee <emoji> — steal an emoji into this server ────────────────────────
const swipee = {
  name: 'swipee',
  category: 'utility',
  description: 'Steal an emoji and add it to this server',
  usage: '.swipee <emoji>',
  example: '.swipee 😎 (or paste a custom emoji from another server)',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can manage emojis.')] });

    if (!args[0])
      return message.reply({ embeds: [errorEmbed('Provide an emoji.\n**Usage:** `.swipee <emoji>`')] });

    // Try to extract custom emoji ID from format <:name:id> or <a:name:id>
    const customMatch = args[0].match(/<a?:([^:]+):(\d+)>/);
    let emojiUrl = null;
    let defaultName = null;

    if (customMatch) {
      const animated = args[0].startsWith('<a:');
      const emojiId  = customMatch[2];
      defaultName    = customMatch[1];
      emojiUrl       = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}`;
    } else {
      return message.reply({ embeds: [errorEmbed('That doesn\'t look like a custom emoji. Use `.ie` to turn an image into an emoji instead.')] });
    }

    const name = await promptName(message, `What do you want to name this emoji? (letters, numbers, underscores only)\nDefault will be \`${defaultName}\` if you just send a dot.`);
    if (name === null)
      return message.channel.send({ embeds: [errorEmbed('Cancelled.')] }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));

    const finalName = name === '.' ? defaultName : name;

    try {
      const emoji = await message.guild.emojis.create({
        attachment: emojiUrl,
        name: finalName,
        reason: `Emoji swiped by ${message.author.tag}`,
      });
      return message.reply({ embeds: [successEmbed(`Emoji **${emoji.name}** added! Use it as ${emoji.toString()}`)] });
    } catch (err) {
      if (err.message?.includes('Maximum') || err.code === 30008) {
        return message.reply({ embeds: [errorEmbed('This server has reached the **maximum number of emojis**.')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

// ── .ie (image to emoji) — attach image or provide URL ───────────────────────
const ie = {
  name: 'ie',
  category: 'utility',
  description: 'Turn an attached image into a server emoji',
  usage: '.ie (attach image) OR .ie <image url>',
  example: '.ie (with image attached)',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can manage emojis.')] });

    const attachment = message.attachments.first();
    const url = attachment?.url || args[0];

    if (!url)
      return message.reply({ embeds: [errorEmbed('Attach an image or provide an image URL.\n**Usage:** `.ie` (with image attached)')] });

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (attachment?.contentType && !validTypes.includes(attachment.contentType))
      return message.reply({ embeds: [errorEmbed('Only PNG, JPG, GIF, or WEBP images supported.')] });

    const name = await promptName(message, '📝 What do you want to name this emoji?\n(letters, numbers, underscores only — no spaces)');
    if (name === null)
      return message.channel.send({ embeds: [errorEmbed('Cancelled.')] }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));

    if (!/^[a-zA-Z0-9_]+$/.test(name))
      return message.reply({ embeds: [errorEmbed('Emoji names can only contain letters, numbers, and underscores.')] });

    try {
      const emoji = await message.guild.emojis.create({
        attachment: url,
        name,
        reason: `Image emoji by ${message.author.tag}`,
      });
      return message.reply({ embeds: [successEmbed(`Emoji **${emoji.name}** added! Use it as ${emoji.toString()}`)] });
    } catch (err) {
      if (err.message?.includes('Maximum') || err.code === 30008) {
        return message.reply({ embeds: [errorEmbed('This server has reached the **maximum number of emojis**.')] });
      }
      if (err.message?.includes('File cannot be larger')) {
        return message.reply({ embeds: [errorEmbed('Image is too large. Emojis must be under **256KB**.')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

// ── .swipes <sticker url> — steal a sticker ───────────────────────────────────
const swipes = {
  name: 'swipes',
  category: 'utility',
  description: 'Add a sticker to this server from a URL or attached image',
  usage: '.swipes <sticker url> OR .swipes (attach image)',
  example: '.swipes https://cdn.discordapp.com/stickers/xxxxx.png',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can manage stickers.')] });

    const attachment = message.attachments.first();
    const url = attachment?.url || args[0];

    if (!url)
      return message.reply({ embeds: [errorEmbed('Provide a sticker URL or attach an image.\n**Note:** Stickers require **Level 1 boost** (2 boosts).')] });

    const name = await promptName(message, '📝 What do you want to name this sticker?\n(2-30 characters, letters/numbers/spaces)');
    if (name === null)
      return message.channel.send({ embeds: [errorEmbed('Cancelled.')] }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));

    if (name.length < 2 || name.length > 30)
      return message.reply({ embeds: [errorEmbed('Sticker name must be between **2 and 30** characters.')] });

    // Ask for a description/emoji tag (Discord requires this for stickers)
    const tagPrompt = await message.channel.send({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('Type a **related emoji** for this sticker (Discord requires this, e.g. `😎`)')]
    });

    const filter = m => m.author.id === message.author.id;
    let tag = '⭐';
    try {
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20_000, errors: ['time'] });
      tag = collected.first().content.trim();
      await tagPrompt.delete().catch(() => {});
      await collected.first().delete().catch(() => {});
    } catch {
      await tagPrompt.delete().catch(() => {});
    }

    try {
      const sticker = await message.guild.stickers.create({
        file: url,
        name: name.replace(/_/g, ' '), // stickers allow spaces
        tags: tag,
        reason: `Sticker added by ${message.author.tag}`,
      });
      return message.reply({ embeds: [successEmbed(`Sticker **${sticker.name}** added to the server!`)] });
    } catch (err) {
      if (err.message?.includes('Maximum') || err.code === 30039) {
        return message.reply({ embeds: [errorEmbed('This server has reached the **maximum number of stickers**.')] });
      }
      if (err.message?.includes('tier') || err.message?.includes('boost')) {
        return message.reply({ embeds: [errorEmbed('Stickers require at least **Level 1 boost** (2 boosts).')] });
      }
      if (err.message?.includes('size') || err.message?.includes('large')) {
        return message.reply({ embeds: [errorEmbed('Sticker file is too large. Must be under **512KB**.')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

// ── .is (image to sticker) ────────────────────────────────────────────────────
const is = {
  name: 'is',
  category: 'utility',
  description: 'Turn an attached image into a server sticker',
  usage: '.is (attach image)',
  example: '.is (with image attached)',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can manage stickers.')] });

    const attachment = message.attachments.first();
    const url = attachment?.url || args[0];

    if (!url)
      return message.reply({ embeds: [errorEmbed('Attach an image.\n**Note:** Stickers require **Level 1 boost** (2 boosts) and must be PNG or APNG.')] });

    // Validate image type for stickers
    const validSticker = ['image/png', 'image/apng'];
    if (attachment?.contentType && !['image/png'].includes(attachment.contentType) && !attachment.contentType.includes('apng')) {
      return message.reply({ embeds: [errorEmbed('Stickers must be **PNG or APNG** format only.')] });
    }

    const name = await promptName(message, '📝 What do you want to name this sticker?\n(2-30 characters)');
    if (name === null)
      return message.channel.send({ embeds: [errorEmbed('Cancelled.')] }).then(m => setTimeout(() => m.delete().catch(() => {}), 3000));

    if (name.length < 2 || name.length > 30)
      return message.reply({ embeds: [errorEmbed('Sticker name must be between **2 and 30** characters.')] });

    const tagPrompt = await message.channel.send({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('Type a **related emoji** for this sticker (e.g. `🎉`)')]
    });

    const filter = m => m.author.id === message.author.id;
    let tag = '⭐';
    try {
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20_000, errors: ['time'] });
      tag = collected.first().content.trim();
      await tagPrompt.delete().catch(() => {});
      await collected.first().delete().catch(() => {});
    } catch {
      await tagPrompt.delete().catch(() => {});
    }

    try {
      const sticker = await message.guild.stickers.create({
        file: url,
        name: name.replace(/_/g, ' '),
        tags: tag,
        reason: `Image sticker by ${message.author.tag}`,
      });
      return message.reply({ embeds: [successEmbed(`Sticker **${sticker.name}** added to the server!`)] });
    } catch (err) {
      if (err.message?.includes('Maximum') || err.code === 30039) {
        return message.reply({ embeds: [errorEmbed('Maximum stickers reached.')] });
      }
      if (err.message?.includes('tier') || err.message?.includes('boost')) {
        return message.reply({ embeds: [errorEmbed('Stickers require at least **Level 1 boost** (2 boosts).')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

module.exports = [swipee, ie, swipes, is];
