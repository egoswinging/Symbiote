const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'dm',
  category: 'utility',
  description: 'DM every member in the server your exact message',
  usage: '.dm <message>',
  example: '.dm Yo join the #host.',

  async execute(message, args, client, config) {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    const isBotOwner = ownerIds.includes(message.author.id);
    const { getPermTier, tierRank } = require('../../utils/permissions');
    const tier = await getPermTier(message.member, config);

    if (!isBotOwner && tierRank(tier) < tierRank('inner_circle'))
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members or the bot owner can mass DM.')] });

    // Everything after .dm is the message — exactly as typed
    const content = message.content.slice(message.content.indexOf(args[0])).trim();

    if (!content)
      return message.reply({ embeds: [errorEmbed('Provide a message.\n**Usage:** `.dm <your message here>`')] });

    // Delete the command silently
    await message.delete().catch(() => {});

    const status = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(`⏳ Sending DMs to all members...`)]
    });

    await message.guild.members.fetch();
    const members = message.guild.members.cache.filter(m => !m.user.bot);

    let sent = 0;
    let failed = 0;

    for (const [, member] of members) {
      try {
        // Send EXACTLY what was typed — plain text, no embed
        await member.send(`**${message.guild.name}:** ${content}`);
        sent++;
      } catch {
        failed++;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    await status.edit({
      embeds: [successEmbed(
        `Mass DM complete!\n` +
        `✅ **Sent:** ${sent}\n` +
        `❌ **Failed (DMs disabled):** ${failed}`
      )]
    });

    setTimeout(() => status.delete().catch(() => {}), 10000);
  },
};
