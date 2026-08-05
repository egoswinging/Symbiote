const { EmbedBuilder } = require('discord.js');
const question = require('./question');

const PREFIX = process.env.PREFIX || '.';
const QUESTION_CATALOG = question.questionCatalog || [];

module.exports = {
  name: 'questionlist',
  aliases: ['qlist', 'questions'],
  category: 'utility',
  description: 'Show example questions the command helper can answer',
  usage: '.questionlist [page]',
  example: '.questionlist',

  async execute(message, args) {
    const pageSize = 8;
    const maxPage = Math.max(1, Math.ceil(QUESTION_CATALOG.length / pageSize));
    const requestedPage = Number.parseInt(args[0], 10);
    const page = Number.isInteger(requestedPage)
      ? Math.min(Math.max(requestedPage, 1), maxPage)
      : 1;

    const start = (page - 1) * pageSize;
    const items = QUESTION_CATALOG.slice(start, start + pageSize);
    const lines = items.map(item => [
      `**Q:** ${item.question}`,
      `**Copy:** \`${PREFIX}question ${item.question}\``,
      `**Bot:** ${item.response}`,
      `**Command:** \`${PREFIX}${item.command}\``,
    ].join('\n'));

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Questions You Can Ask')
      .setDescription(lines.length ? lines.join('\n\n') : `No saved questions yet. Try \`${PREFIX}question help\`.`)
      .setFooter({ text: `Page ${page}/${maxPage} - use ${PREFIX}questionlist <page>` });

    return message.reply({ embeds: [embed] });
  },
};
