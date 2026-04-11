const { resolveMember } = require('../../utils/helpers');
const { errorEmbed } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

// ── ,ui (user info) ───────────────────────────────────────────────────────────
const ui = {
  name: 'ui',
  aliases: ['userinfo', 'whois'],
  category: 'info',
  description: 'Show user information',
  usage: '.ui [@user]',

  async execute(message, args, client, config) {
    const target = (args[0] ? await resolveMember(message.guild, args[0]) : message.member);
    if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

    const user = target.user;
    const roles = target.roles.cache
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position);

    const embed = new EmbedBuilder()
      .setColor(target.displayColor || 0x5865F2)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 User ID',    value: `\`${user.id}\``,                    inline: true },
        { name: '📅 Created',    value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📥 Joined',     value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: '🎭 Nick',       value: target.nickname || '`None`',          inline: true },
        { name: '🤖 Bot',        value: user.bot ? '`Yes`' : '`No`',          inline: true },
        { name: '💎 Boosting',   value: target.premiumSince ? `<t:${Math.floor(target.premiumSinceTimestamp / 1000)}:R>` : '`No`', inline: true },
        {
          name: `🎭 Roles [${roles.size}]`,
          value: roles.size ? roles.map(r => r.toString()).slice(0, 10).join(' ') + (roles.size > 10 ? ` +${roles.size - 10} more` : '') : '`None`',
          inline: false,
        },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

// ── ,si (server info) ─────────────────────────────────────────────────────────
const si = {
  name: 'si',
  aliases: ['serverinfo', 'guild'],
  category: 'info',
  description: 'Show server information',
  usage: '.si',

  async execute(message, args, client, config) {
    const guild = message.guild;
    await guild.fetch();

    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;
    const text  = channels.filter(c => c.type === 0).size;
    const voice = channels.filter(c => c.type === 2).size;
    const cats  = channels.filter(c => c.type === 4).size;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 ID',         value: `\`${guild.id}\``,                              inline: true },
        { name: '👑 Owner',       value: owner ? `<@${owner.id}>` : '`Unknown`',         inline: true },
        { name: '📅 Created',     value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '👥 Members',     value: `\`${guild.memberCount}\``,                    inline: true },
        { name: '💎 Boosts',      value: `\`${guild.premiumSubscriptionCount}\` (Tier ${guild.premiumTier})`, inline: true },
        { name: '🌐 Locale',      value: `\`${guild.preferredLocale}\``,               inline: true },
        { name: '💬 Text',        value: `\`${text}\``,  inline: true },
        { name: '🔊 Voice',       value: `\`${voice}\``, inline: true },
        { name: '📁 Categories',  value: `\`${cats}\``,  inline: true },
        { name: '🎭 Roles',       value: `\`${guild.roles.cache.size}\``, inline: true },
        { name: '😀 Emojis',      value: `\`${guild.emojis.cache.size}\``, inline: true },
        { name: '🔒 Verification',value: `\`${guild.verificationLevel}\``, inline: true },
      )
      .setImage(guild.bannerURL({ size: 1024 }))
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

// ── ,av (avatar) ──────────────────────────────────────────────────────────────
const av = {
  name: 'av',
  aliases: ['avatar', 'pfp'],
  category: 'info',
  description: "Show a user's avatar",
  usage: '.av [@user]',

  async execute(message, args, client, config) {
    const target = args[0] ? await resolveMember(message.guild, args[0]) : message.member;
    const user = target?.user || message.author;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: user.tag })
      .setTitle('Avatar')
      .setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setURL(user.displayAvatarURL({ dynamic: true, size: 1024 }));

    return message.reply({ embeds: [embed] });
  },
};

// ── ,banner ───────────────────────────────────────────────────────────────────
const banner = {
  name: 'banner',
  category: 'info',
  description: "Show a user's banner",
  usage: '.banner [@user]',

  async execute(message, args, client, config) {
    const targetMember = args[0] ? await resolveMember(message.guild, args[0]) : message.member;
    const user = await (targetMember?.user || message.author).fetch(); // fetch for banner

    const bannerURL = user.bannerURL({ dynamic: true, size: 1024 });
    if (!bannerURL)
      return message.reply({ embeds: [errorEmbed(`**${user.tag}** has no banner.`)] });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: user.tag })
      .setTitle('Banner')
      .setImage(bannerURL)
      .setURL(bannerURL);

    return message.reply({ embeds: [embed] });
  },
};

// ── ,mc (member count) ────────────────────────────────────────────────────────
const mc = {
  name: 'mc',
  aliases: ['membercount'],
  category: 'info',
  description: 'Show server member count',
  usage: '.mc',

  async execute(message, args, client, config) {
    const guild = message.guild;
    const humans = guild.members.cache.filter(m => !m.user.bot).size;
    const bots   = guild.members.cache.filter(m => m.user.bot).size;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`👥 ${guild.name} — Member Count`)
      .addFields(
        { name: 'Total',  value: `\`${guild.memberCount}\``, inline: true },
        { name: 'Humans', value: `\`${humans}\``,            inline: true },
        { name: 'Bots',   value: `\`${bots}\``,              inline: true },
      );

    return message.reply({ embeds: [embed] });
  },
};

module.exports = [ui, si, av, banner, mc];
