const { requireTier } = require('../../utils/permissions');
const { successEmbed, errorEmbed, paginate } = require('../../utils/embeds');
const { resolveRole, resolveMember, chunk } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

// ── ,role ─────────────────────────────────────────────────────────────────────
const role = {
  name: 'role',
  category: 'moderation',
  description: 'Give, remove, or create a role',
  usage: '.role <give|remove|create> <@user|name> [name]',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v2', config))
      return message.reply({ embeds: [errorEmbed('You need **v2** or higher.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'give' || sub === 'remove') {
      const target = await resolveMember(message.guild, args[1]);
      if (!target) return message.reply({ embeds: [errorEmbed('Member not found.')] });

      const roleObj = resolveRole(message.guild, args[2]);
      if (!roleObj) return message.reply({ embeds: [errorEmbed('Role not found.')] });

      if (roleObj.managed)
        return message.reply({ embeds: [errorEmbed('Cannot manage bot-managed roles.')] });
      if (roleObj.position >= message.guild.members.me.roles.highest.position)
        return message.reply({ embeds: [errorEmbed('That role is above my highest role.')] });

      if (sub === 'give') {
        await target.roles.add(roleObj, `Role give by ${message.author.tag}`);
        return message.reply({ embeds: [successEmbed(`Gave ${roleObj} to ${target}.`)] });
      } else {
        await target.roles.remove(roleObj, `Role remove by ${message.author.tag}`);
        return message.reply({ embeds: [successEmbed(`Removed ${roleObj} from ${target}.`)] });
      }
    }

    if (sub === 'create') {
      const name = args.slice(1).join(' ');
      if (!name) return message.reply({ embeds: [errorEmbed('Provide a role name.')] });

      const newRole = await message.guild.roles.create({
        name,
        reason: `Created by ${message.author.tag}`,
      });

      return message.reply({ embeds: [successEmbed(`Created role ${newRole}.`)] });
    }

    return message.reply({ embeds: [errorEmbed('Usage: `,role <give|remove|create> <args>`')] });
  },
};

// ── ,inrole ───────────────────────────────────────────────────────────────────
const inrole = {
  name: 'inrole',
  category: 'info',
  description: 'Show all members with a specific role',
  usage: '.inrole <@role>',

  async execute(message, args, client, config) {
    const roleObj = resolveRole(message.guild, args[0]);
    if (!roleObj) return message.reply({ embeds: [errorEmbed('Role not found.')] });

    await message.guild.members.fetch();
    const members = roleObj.members;
    if (!members.size)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription(`No members with ${roleObj}.`)] });

    const pages = chunk([...members.values()], 20).map((group, i, arr) =>
      new EmbedBuilder()
        .setColor(roleObj.color || 0x5865F2)
        .setTitle(`Members in ${roleObj.name} — ${members.size}`)
        .setDescription(group.map(m => `${m} (${m.user.tag})`).join('\n'))
        .setFooter({ text: `Page ${i + 1}/${arr.length}` })
    );

    return paginate(message, pages);
  },
};

// ── ,roles ────────────────────────────────────────────────────────────────────
const roles = {
  name: 'roles',
  category: 'info',
  description: 'Show all roles in the server',
  usage: '.roles',

  async execute(message, args, client, config) {
    const sorted = [...message.guild.roles.cache.values()]
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position);

    if (!sorted.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription('No roles.')] });

    const pages = chunk(sorted, 25).map((group, i, arr) =>
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Roles — ${message.guild.name} (${sorted.length} total)`)
        .setDescription(group.map(r => `${r} — \`${r.members.size} members\``).join('\n'))
        .setFooter({ text: `Page ${i + 1}/${arr.length}` })
    );

    return paginate(message, pages);
  },
};

// ── ,removeall ────────────────────────────────────────────────────────────────
const removeall = {
  name: 'removeall',
  category: 'moderation',
  description: 'Mass remove a role from everyone who has it',
  usage: '.removeall <@role>',

  async execute(message, args, client, config) {
    if (!await requireTier(message.member, 'v1', config))
      return message.reply({ embeds: [errorEmbed('You need **v1** or higher.')] });

    const roleObj = resolveRole(message.guild, args[0]);
    if (!roleObj) return message.reply({ embeds: [errorEmbed('Role not found.')] });

    if (roleObj.managed)
      return message.reply({ embeds: [errorEmbed('Cannot manage bot-managed roles.')] });

    await message.guild.members.fetch();
    const withRole = roleObj.members;
    if (!withRole.size)
      return message.reply({ embeds: [errorEmbed(`No members have ${roleObj}.`)] });

    const status = await message.reply({ embeds: [{ color: 0x5865F2, description: `⏳ Removing ${roleObj} from **${withRole.size}** members...` }] });

    let done = 0;
    for (const [, member] of withRole) {
      await member.roles.remove(roleObj, `Removeall by ${message.author.tag}`).catch(() => {});
      done++;
      if (done % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    }

    return status.edit({ embeds: [successEmbed(`Removed ${roleObj} from **${done}** members.`)] });
  },
};

module.exports = [role, inrole, roles, removeall];
