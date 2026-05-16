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

// ── .setavatar ────────────────────────────────────────────────────────────────
const setavatar = {
  name: 'setavatar',
  aliases: ['sav'],
  category: 'utility',
  description: "Change the bot's avatar — attach an image (bot owner only)",
  usage: '.setavatar (attach image)',
  example: '.setavatar (with image attached)',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can change the avatar.')] });

    const attachment = message.attachments.first();
    if (!attachment)
      return message.reply({ embeds: [errorEmbed('Attach an image to the message.')] });

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (attachment.contentType && !validTypes.includes(attachment.contentType))
      return message.reply({ embeds: [errorEmbed('Only PNG, JPG, GIF, or WEBP images are supported.')] });

    try {
      await client.user.setAvatar(attachment.url);
      return message.reply({ embeds: [successEmbed('Bot avatar updated!').setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))] });
    } catch (err) {
      if (err.code === 50035 || err.message?.includes('Too many')) {
        return message.reply({ embeds: [errorEmbed('Rate limited — Discord only allows avatar changes once every **10 minutes**.')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

// ── .serverav ─────────────────────────────────────────────────────────────────
const serverav = {
  name: 'serverav',
  category: 'utility',
  description: "Change the server icon — attach an image (inner circle only)",
  usage: '.serverav (attach image)',
  example: '.serverav (with image attached)',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can change the server icon.')] });

    const attachment = message.attachments.first();
    if (!attachment)
      return message.reply({ embeds: [errorEmbed('Attach an image to the message.')] });

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (attachment.contentType && !validTypes.includes(attachment.contentType))
      return message.reply({ embeds: [errorEmbed('Only PNG, JPG, GIF, or WEBP images are supported.')] });

    try {
      await message.guild.setIcon(attachment.url, `Icon changed by ${message.author.tag}`);
      await silentReply(message, successEmbed('Server icon updated!').setThumbnail(message.guild.iconURL({ dynamic: true })));
    } catch (err) {
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

// ── .serverbanner ─────────────────────────────────────────────────────────────
const serverbanner = {
  name: 'serverbanner',
  category: 'utility',
  description: "Change the server banner — attach image (requires Level 2 boost, inner circle only)",
  usage: '.serverbanner (attach image)',
  example: '.serverbanner (with image attached)',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can change the server banner.')] });

    const attachment = message.attachments.first();
    if (!attachment)
      return message.reply({ embeds: [errorEmbed('Attach an image.\n**Note:** Requires **Level 2 boost** (7 boosts).')] });

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (attachment.contentType && !validTypes.includes(attachment.contentType))
      return message.reply({ embeds: [errorEmbed('Only PNG, JPG, or WEBP supported for banners.')] });

    try {
      await message.guild.setBanner(attachment.url, `Banner changed by ${message.author.tag}`);
      await silentReply(message, successEmbed('Server banner updated!').setImage(attachment.url));
    } catch (err) {
      if (err.code === 50074 || err.message?.includes('tier') || err.message?.includes('boost')) {
        return message.reply({ embeds: [errorEmbed('Failed — requires **Level 2 boost** (7 boosts).')] });
      }
      return message.reply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
    }
  },
};

// ── .ss — change bot presence status ─────────────────────────────────────────
const ss = {
  name: 'ss',
  category: 'utility',
  description: "Change the bot's online status (bot owner only)",
  usage: '.ss <online|idle|dnd|invisible>',
  example: '.ss dnd\n.ss online\n.ss invisible\n.ss idle',

  async execute(message, args, client, config) {
    if (!isBotOwner(message.author.id))
      return message.reply({ embeds: [errorEmbed('Only the **bot owner** can change the bot status.')] });

    const input = args[0]?.toLowerCase();
    if (!input)
      return message.reply({ embeds: [errorEmbed('Usage: `.ss <online|idle|dnd|invisible>`')] });

    const statusMap = {
      online:    'online',
      idle:      'idle',
      busy:      'dnd',
      dnd:       'dnd',
      offline:   'invisible',
      invisible: 'invisible',
    };

    const resolved = statusMap[input];
    if (!resolved)
      return message.reply({ embeds: [errorEmbed('Invalid status. Use: `online`, `idle`, `dnd`, `invisible`')] });

    // setStatus alone sometimes doesn't persist — set full presence
    await client.user.setPresence({
      status: resolved,
      activities: client.user.presence?.activities || [],
    });

    const emoji = { online: '🟢', idle: '🟡', dnd: '🔴', invisible: '⚫' };
    await silentReply(message, successEmbed(`Bot status set to ${emoji[resolved]} **${resolved}**.`));
  },
};

// ── .status — change bot activity text ────────────────────────────────────────
const status = {
  name: 'status',
  category: 'utility',
  description: "Change the bot's activity status text (inner circle)",
  usage: '.status <text>',
  example: '.status Watching over the server',

  async execute(message, args, client, config) {
    if (!await isInnerCircle(message.member))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members can change the status text.')] });

    const text = args.join(' ').trim();
    if (!text)
      return message.reply({ embeds: [errorEmbed('Provide status text.\n**Usage:** `.status <text>`')] });

    await client.user.setPresence({
      activities: [{ name: text, type: ActivityType.Watching }],
      status: client.user.presence?.status || 'online',
    });

    await silentReply(message, successEmbed(`Bot status text set to: **${text}**`));
  },
};

module.exports = [setavatar, serverav, serverbanner, ss, status];
