const { EmbedBuilder } = require('discord.js');
const { paginate } = require('../../utils/embeds');
const UserData = require('../../models/UserData');

const PREFIX = process.env.PREFIX || '.';

const COMMAND_DATA = {
  admin: [
    { name: 'on',          desc: 'Enable ban/kick/timeout perms for ALL v1/v2/v3 roles',     example: '.on' },
    { name: 'off',         desc: 'Disable ban/kick/timeout perms for ALL v1/v2/v3 roles',    example: '.off' },
    { name: 'strip',       desc: 'Remove any role with ban/kick/timeout perms from a user',   example: '.strip @John' },
    { name: 'roleadd',     desc: 'Add a role to a tier (v1/v2/v3)',                           example: '.roleadd v1 @AdminRole' },
    { name: 'roleremove',  desc: 'Remove a role from a tier',                                 example: '.roleremove v2 @ModRole' },
    { name: 'setrole',     desc: 'Set the owner, vanish, or access role',                     example: '.setrole owner @OwnerRole' },
    { name: 'resetrole',   desc: 'Reset a role config key',                                   example: '.resetrole vanish' },
    { name: 'showconfig',  desc: 'Show the full server bot config',                           example: '.showconfig' },
    { name: 'rolelist',    desc: 'View all roles in a specific tier',                         example: '.rolelist v1' },
    { name: 'antinuke',    desc: 'Manage the anti-nuke system',                               example: '.antinuke enable' },
  ],
  moderation: [
    { name: 'wipe',          desc: 'Ban a user from the server',                              example: '.wipe @John rule breaking' },
    { name: 'unwipe',        desc: 'Unban a wiped user by ID',                                example: '.unwipe 123456789012345678' },
    { name: 'unwipeall',     desc: 'Unban everyone and reset the wipe list',                  example: '.unwipeall' },
    { name: 'wipelist',      desc: 'Show all wiped (banned) users',                           example: '.wipelist' },
    { name: 'click',         desc: 'Perma-ban — user is auto-rebanned if they rejoin',        example: '.click @John' },
    { name: 'unclick',       desc: 'Remove the perma-ban from a user',                        example: '.unclick 123456789012345678' },
    { name: 'vanish',        desc: 'Remove all roles and apply vanish role',                  example: '.vanish @John being toxic' },
    { name: 'unvanish',      desc: 'Remove the vanish role (roles NOT restored)',             example: '.unvanish @John' },
    { name: 'restorevanish', desc: 'Restore the roles a user had before being vanished',      example: '.restorevanish @John' },
    { name: 'vanishlist',    desc: 'Show all vanished users',                                 example: '.vanishlist' },
    { name: 'setupvanish',   desc: 'Apply vanish role deny perms to every channel',           example: '.setupvanish' },
    { name: 'kick',          desc: 'Kick a member',                                           example: '.kick @John spamming' },
    { name: 'timeout',       desc: 'Timeout a member for X minutes',                          example: '.timeout @John 30 spam' },
    { name: 'modlogs',       desc: 'View mod history for a user',                             example: '.modlogs @John' },
    { name: 'nuke',          desc: 'Clone and delete the current channel',                    example: '.nuke' },
    { name: 'clean',         desc: 'Toggle auto-delete mode in this channel',                 example: '.clean' },
    { name: 'shush',         desc: 'Auto-delete ALL future messages from a user',             example: '.shush @John' },
    { name: 'unshush',       desc: 'Stop auto-deleting messages from a shushed user',        example: '.unshush @John' },
    { name: 'blacklist',     desc: 'Block a user from using the bot',                         example: '.blacklist @John' },
    { name: 'bllist',        desc: 'Show all blacklisted users',                              example: '.bllist' },
    { name: 'role',          desc: 'Give, remove, or create a role',                          example: '.role give @John @Mod' },
    { name: 'inrole',        desc: 'Show all members with a specific role',                   example: '.inrole @Mod' },
    { name: 'roles',         desc: 'Show all roles in the server',                            example: '.roles' },
    { name: 'removeall',     desc: 'Remove a role from every member that has it',             example: '.removeall @Muted' },
    { name: 'restore',       desc: 'Restore saved roles to a user',                           example: '.restore @John' },
  ],
  owner: [
    { name: 'add',               desc: 'Add a user to the public whitelist',                  example: '.add @John' },
    { name: 'remove',            desc: 'Remove a user from the public whitelist',             example: '.remove @John' },
    { name: 'them',              desc: 'Show all whitelisted users',                          example: '.them' },
    { name: 'st',                desc: 'Add a user to the ST list',                           example: '.st @John' },
    { name: 'unst',              desc: 'Remove a user from the ST list',                      example: '.unst @John' },
    { name: 'hidden',            desc: 'Show all users in the ST whitelist',                  example: '.hidden' },
    { name: 'secret',            desc: 'Toggle owner role on yourself',                       example: '.secret' },
    { name: 'innercircle',       desc: 'Grant a user full inner circle access',               example: '.innercircle @John' },
    { name: 'innercirclelist',   desc: 'Show all inner circle members',                       example: '.innercirclelist' },
    { name: 'removeinnercircle', desc: 'Remove a user from the inner circle',                 example: '.removeinnercircle @John' },
  ],
  utility: [
    { name: 'autoresponder', desc: 'Manage auto-responders',                                  example: '.ar add hello | Hello!\n.ar remove hello\n.ar list' },
    { name: 'automod',       desc: 'Manage automod word/link filter',                         example: '.automod add word badword' },
    { name: 'allow',         desc: 'Set a role allowed to ping @everyone',                    example: '.allow @Announcements' },
    { name: 'setuplogger',   desc: 'Create and set the logging channel',                      example: '.setuplogger' },
    { name: 'saveserver',    desc: 'Save the full server layout',                             example: '.saveserver' },
    { name: 'serverload',    desc: 'Restore the server layout from backup',                   example: '.serverload' },
    { name: 'resetsave',     desc: 'Delete the saved server backup',                          example: '.resetsave' },
    { name: 's',             desc: 'Snipe the last deleted message',                          example: '.s' },
    { name: 'cs',            desc: 'Clear the sniped message',                                example: '.cs' },
    { name: 'c',             desc: 'Delete a number of messages (1-100)',                     example: '.c 50' },
    { name: 'forcenick',     desc: 'Force or clear a nickname on a user',                     example: '.forcenick @John BigNerd' },
    { name: 'pic',           desc: 'Grant image permissions to a user',                       example: '.pic @John' },
    { name: 'drag',          desc: 'Drag a user into your voice channel',                     example: '.drag @John' },
    { name: 'setavatar',     desc: "Change the bot's avatar",                                 example: '.setavatar (attach image)' },
    { name: 'help',          desc: 'Show this help menu',                                     example: '.help\n.help wipe' },
  ],
  info: [
    { name: 'ui',     desc: 'Show detailed user information',   example: '.ui @John' },
    { name: 'si',     desc: 'Show server information',          example: '.si' },
    { name: 'av',     desc: "Show a user's avatar",             example: '.av @John' },
    { name: 'banner', desc: "Show a user's banner",             example: '.banner @John' },
    { name: 'mc',     desc: 'Show the server member count',     example: '.mc' },
  ],
  voice: [
    { name: 'setupj2c',  desc: 'Create the join-to-create voice channel', example: '.setupj2c' },
    { name: 'vclaim',    desc: 'Claim a J2C channel whose owner left',    example: '.vclaim' },
    { name: 'vclock',    desc: 'Lock your J2C channel',                   example: '.vclock' },
    { name: 'vcunlock',  desc: 'Unlock your J2C channel',                 example: '.vcunlock' },
    { name: 'vcpermit',  desc: 'Allow a user to join your locked channel', example: '.vcpermit @John' },
    { name: 'vcreject',  desc: 'Kick a user from your channel',           example: '.vcreject @John' },
  ],
};

// Categories hidden from non-ST/IC users
const PROTECTED_CATEGORIES = new Set(['admin', 'moderation', 'owner', 'utility', 'voice']);

const CATEGORY_META = {
  admin:      { emoji: '⚙️',  label: 'Admin',      color: 0xEB459E },
  moderation: { emoji: '🔨',  label: 'Moderation', color: 0xED4245 },
  owner:      { emoji: '👑',  label: 'Owner',       color: 0xFEE75C },
  utility:    { emoji: '🛠️',  label: 'Utility',    color: 0x5865F2 },
  info:       { emoji: '📋',  label: 'Info',        color: 0x57F287 },
  voice:      { emoji: '🔊',  label: 'Voice',       color: 0x57F287 },
};

module.exports = {
  name: 'help',
  aliases: ['h', 'cmds'],
  category: 'utility',
  description: 'Show all commands with examples',
  usage: '.help [command]',
  example: '.help\n.help wipe',

  async execute(message, args, client, config) {
    // Check if user is ST, inner circle, or bot owner
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    const isBotOwner = ownerIds.includes(message.author.id);
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    const isPrivileged = isBotOwner || ud?.isInnerCircle || ud?.isSecret;

    // Determine which categories to show
    const visibleCategories = Object.entries(COMMAND_DATA).filter(([cat]) => {
      if (PROTECTED_CATEGORIES.has(cat) && !isPrivileged) return false;
      return true;
    });

    // ── Specific command lookup ───────────────────────────────────────────────
    if (args[0]) {
      const name = args[0].toLowerCase();

      // Check if this command belongs to a protected category
      let found = null;
      let foundCat = null;
      for (const [cat, cmds] of Object.entries(COMMAND_DATA)) {
        const match = cmds.find(c => c.name === name);
        if (match) { found = match; foundCat = cat; break; }
      }

      // Hide protected commands from non-privileged users
      if (found && PROTECTED_CATEGORIES.has(foundCat) && !isPrivileged) {
        return message.reply({ embeds: [{ color: 0xED4245, description: `❌ Command \`${name}\` not found.` }] });
      }

      const cmd = client.commands.get(name);
      if (!found && !cmd)
        return message.reply({ embeds: [{ color: 0xED4245, description: `❌ Command \`${name}\` not found.` }] });

      const meta = CATEGORY_META[foundCat || cmd?.category] || { color: 0x5865F2 };
      const embed = new EmbedBuilder()
        .setColor(meta.color)
        .setTitle(`📖 \`${PREFIX}${found?.name || cmd.name}\``)
        .addFields(
          { name: 'Description', value: found?.desc || cmd?.description || 'No description', inline: false },
          { name: 'Usage',       value: `\`${cmd?.usage || PREFIX + name}\``,                inline: true },
          { name: 'Category',    value: `\`${foundCat || cmd?.category || 'misc'}\``,        inline: true },
          { name: 'Example',     value: found?.example ? `\`\`\`\n${found.example}\n\`\`\`` : '`No example`', inline: false },
        );

      if (cmd?.aliases?.length) embed.addFields({ name: 'Aliases', value: cmd.aliases.map(a => `\`${a}\``).join(', '), inline: false });
      return message.reply({ embeds: [embed] });
    }

    // ── Paginated help ────────────────────────────────────────────────────────
    const totalCmds = visibleCategories.reduce((a, [, cmds]) => a + cmds.length, 0);

    const pages = [];

    // Cover page
    pages.push(
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📚 Command List')
        .setDescription([
          `**Prefix:** \`${PREFIX}\``,
          `**Total Commands:** \`${totalCmds}\``,
          '',
          ...visibleCategories.map(([cat]) => {
            const meta = CATEGORY_META[cat];
            const count = COMMAND_DATA[cat]?.length || 0;
            return `${meta.emoji} **${meta.label}** — \`${count} commands\``;
          }),
          '',
          `▶ Use the buttons to browse all commands.`,
          `Use \`${PREFIX}help <command>\` for detailed info + example.`,
        ].join('\n'))
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: `Page 1/${visibleCategories.length + 1}` })
    );

    // One page per visible category
    for (const [cat, cmds] of visibleCategories) {
      const meta = CATEGORY_META[cat] || { emoji: '📌', label: cat, color: 0x5865F2 };

      const lines = cmds.map(cmd =>
        `\`${PREFIX}${cmd.name}\`\n> ${cmd.desc}\n> **e.g.** \`${cmd.example.split('\n')[0]}\``
      );

      const chunkSize = 8;
      for (let j = 0; j < lines.length; j += chunkSize) {
        const chunk = lines.slice(j, j + chunkSize);
        pages.push(
          new EmbedBuilder()
            .setColor(meta.color)
            .setTitle(`${meta.emoji} ${meta.label} Commands`)
            .setDescription(chunk.join('\n\n'))
            .setFooter({ text: `Page ${pages.length + 1} • Use ${PREFIX}help <command> for full details` })
        );
      }
    }

    return paginate(message, pages);
  },
};
