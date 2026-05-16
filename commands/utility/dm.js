const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { resolveMember, resolveRole } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'dm',
  category: 'utility',
  description: 'DM everyone, a role, or one member',
  usage: '.dm <message> OR .dm @user <message> OR .dm @role <message> OR .dm everyone <message>',
  example: '.dm @John Check DMs\n.dm @VIP Check your perks!\n.dm everyone Big announcement!',

  async execute(message, args, client, config) {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    const isBotOwner = ownerIds.includes(message.author.id);
    const { getPermTier, tierRank } = require('../../utils/permissions');
    const tier = await getPermTier(message.member, config);

    if (!isBotOwner && tierRank(tier) < tierRank('inner_circle')) {
      return message.reply({ embeds: [errorEmbed('Only **inner circle** members or the bot owner can DM through the bot.')] });
    }

    if (!args.length) {
      return message.reply({ embeds: [errorEmbed(
        'Provide a message.\n\n' +
        '**Usage:**\n' +
        '`.dm <message>` - DM everyone\n' +
        '`.dm everyone <message>` - DM everyone\n' +
        '`.dm @user <message>` - DM one user\n' +
        '`.dm @role <message>` - DM only that role'
      )] });
    }

    let targetRole = null;
    let targetMember = null;
    let content = '';
    const firstArg = args[0];

    if (firstArg.toLowerCase() === 'everyone') {
      content = args.slice(1).join(' ');
    } else if (firstArg.startsWith('<@') && !firstArg.startsWith('<@&')) {
      targetMember = await resolveMember(message.guild, firstArg);
      content = args.slice(1).join(' ');
    } else if (firstArg.startsWith('<@&') || message.mentions.roles.size > 0) {
      targetRole = message.mentions.roles.first() || resolveRole(message.guild, firstArg);
      content = args.slice(1).join(' ');
    } else {
      content = args.join(' ');
    }

    if (!content.trim()) {
      return message.reply({ embeds: [errorEmbed('You need to provide a message after the target.')] });
    }

    if (firstArg.startsWith('<@') && !firstArg.startsWith('<@&') && !targetMember) {
      return message.reply({ embeds: [errorEmbed('Member not found.')] });
    }

    await message.delete().catch(() => {});

    const targetLabel = targetMember
      ? `**${targetMember.user.tag}**`
      : targetRole
        ? `members with **${targetRole.name}**`
        : '**everyone**';

    const status = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(`Fetching members and sending DMs to ${targetLabel}...`)]
    });

    await message.guild.members.fetch();

    let members;
    if (targetMember) {
      members = message.guild.members.cache.filter(m => m.id === targetMember.id && !m.user.bot);
    } else if (targetRole) {
      members = message.guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(targetRole.id));
    } else {
      members = message.guild.members.cache.filter(m => !m.user.bot);
    }

    if (!members.size) {
      await status.edit({ embeds: [errorEmbed(`No members found${targetRole ? ` with role **${targetRole.name}**` : ''}.`)] });
      setTimeout(() => status.delete().catch(() => {}), 5000);
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const [, member] of members) {
      try {
        await member.send(`**${message.guild.name}:** ${content}`);
        sent++;
      } catch {
        failed++;
      }

      if (!targetMember) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await status.edit({
      embeds: [successEmbed(
        `DM complete!\n` +
        `**Target:** ${targetMember ? targetMember.user.tag : targetRole ? `@${targetRole.name}` : 'Everyone'}\n` +
        `**Message:** ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}\n\n` +
        `**Sent:** ${sent}\n` +
        `**Failed (DMs disabled):** ${failed}`
      )]
    });

    setTimeout(() => status.delete().catch(() => {}), 10000);
  },
};
