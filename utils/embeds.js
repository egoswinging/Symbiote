const { EmbedBuilder } = require('discord.js');

const COLORS = {
  success: 0x57F287,
  error:   0xED4245,
  info:    0x5865F2,
  warn:    0xFEE75C,
  mod:     0xEB459E,
  neutral: 0x2B2D31,
};

/** Quick success embed */
function successEmbed(description, title = null) {
  const e = new EmbedBuilder()
    .setColor(COLORS.success)
    .setDescription(`✅ ${description}`);
  if (title) e.setTitle(title);
  return e;
}

/** Quick error embed */
function errorEmbed(description, title = null) {
  const e = new EmbedBuilder()
    .setColor(COLORS.error)
    .setDescription(`❌ ${description}`);
  if (title) e.setTitle(title);
  return e;
}

/** Info embed */
function infoEmbed(description, title = null) {
  const e = new EmbedBuilder()
    .setColor(COLORS.info)
    .setDescription(description);
  if (title) e.setTitle(title);
  return e;
}

/** Warn embed */
function warnEmbed(description) {
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setDescription(`⚠️ ${description}`);
}

/** Mod action embed with fields */
function modEmbed(title, fields = [], footer = null) {
  const e = new EmbedBuilder()
    .setColor(COLORS.mod)
    .setTitle(title)
    .setTimestamp();
  if (fields.length) e.addFields(fields);
  if (footer) e.setFooter({ text: footer });
  return e;
}

/**
 * Send paginated embeds.
 * @param {Message} msg
 * @param {EmbedBuilder[]} pages
 */
async function paginate(msg, pages, startPage = 0) {
  if (!pages.length) return;
  if (pages.length === 1) return msg.reply({ embeds: [pages[0]] });

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  let page = Math.max(0, Math.min(startPage, pages.length - 1));
  const total = pages.length;

  const row = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('page').setLabel(`${page + 1}/${total}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1),
  );

  const sent = await msg.reply({ embeds: [pages[page]], components: [row()] });
  const collector = sent.createMessageComponentCollector({ time: 60_000 });

  collector.on('collect', async i => {
    if (i.user.id !== msg.author.id) {
      return i.reply({ content: 'Not your pagination.', ephemeral: true });
    }
    if (i.customId === 'prev') page--;
    if (i.customId === 'next') page++;
    await i.update({ embeds: [pages[page]], components: [row()] });
  });

  collector.on('end', () => {
    sent.edit({ components: [] }).catch(() => {});
  });
}

module.exports = { successEmbed, errorEmbed, infoEmbed, warnEmbed, modEmbed, paginate, COLORS };
