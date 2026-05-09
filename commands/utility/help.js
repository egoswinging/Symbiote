const { EmbedBuilder } = require('discord.js');
const { paginate } = require('../../utils/embeds');
const UserData = require('../../models/UserData');

const PREFIX = process.env.PREFIX || '.';

const COMMAND_DATA = {
  admin: [
    { name: 'on',          desc: 'Restore all v1/v2/v3 role permissions from saved snapshot',  example: '.on' },
    { name: 'off',         desc: 'Strip ALL permissions from v1/v2/v3 roles and save snapshot', example: '.off' },
    { name: 'strip',       desc: 'Remove any role with ban/kick/timeout perms from a user',     example: '.strip @John' },
    { name: 'roleadd',     desc: 'Add a role to a tier (v1/v2/v3)',                             example: '.roleadd v1 @AdminRole' },
    { name: 'roleremove',  desc: 'Remove a role from a tier',                                   example: '.roleremove v2 @ModRole' },
    { name: 'setrole',     desc: 'Set the owner, vanish, or access role',                       example: '.setrole owner @OwnerRole' },
    { name: 'resetrole',   desc: 'Reset a role config key',                                     example: '.resetrole vanish' },
    { name: 'showconfig',  desc: 'Show the full server bot config',                             example: '.showconfig' },
    { name: 'rolelist',    desc: 'View all roles in a specific tier',                           example: '.rolelist v1' },
    { name: 'antinuke',    desc: 'Manage anti-nuke — use .antinuke for the full guide',         example: '.antinuke add channeldelete ban\n.antinuke add spam timeout\n.antinuke timeout 7d' },
  ],
  moderation: [
    { name: 'wipe',          desc: 'Ban a user from the server',                                example: '.wipe @John rule breaking' },
    { name: 'unwipe',        desc: 'Unban a wiped user by ID',                                  example: '.unwipe 123456789012345678' },
    { name: 'unwipeall',     desc: 'Unban everyone and reset the wipe list',                    example: '.unwipeall' },
    { name: 'wipelist',      desc: 'Show all wiped (banned) users',                             example: '.wipelist' },
    { name: 'click',         desc: 'Perma-ban — user is auto-rebanned if they rejoin',          example: '.click @John' },
    { name: 'unclick',       desc: 'Remove the perma-ban from a user (inner circle only)',      example: '.unclick 123456789012345678' },
    { name: 'vanish',        desc: 'Remove all roles and apply vanish role (silent)',            example: '.vanish @John being toxic' },
    { name: 'unvanish',      desc: 'Remove vanish role only — roles NOT restored (silent)',     example: '.unvanish @John' },
    { name: 'restorevanish', desc: 'Restore the roles a user had before being vanished (silent)', example: '.restorevanish @John' },
    { name: 'vanishlist',    desc: 'Show all vanished users',                                   example: '.vanishlist' },
    { name: 'setupvanish',   desc: 'Apply vanish role deny perms to every channel',             example: '.setupvanish' },
    { name: 'kick',          desc: 'Kick a member from the server',                             example: '.kick @John spamming' },
    { name: 'timeout',       desc: 'Timeout a member for X minutes',                            example: '.timeout @John 30 spam' },
    { name: 'modlogs',       desc: 'View mod action history for a user',                        example: '.modlogs @John' },
    { name: 'nuke',          desc: 'Clone and delete the current channel silently',             example: '.nuke' },
    { name: 'clean',         desc: 'Toggle auto-delete mode in this channel (silent)',          example: '.clean' },
    { name: 'shush',         desc: 'Auto-delete ALL future messages from a user (silent)',      example: '.shush @John' },
    { name: 'unshush',       desc: 'Stop auto-deleting messages from a user (silent)',         example: '.unshush @John' },
    { name: 'blacklist',     desc: 'Block a user from using the bot entirely',                  example: '.blacklist @John' },
    { name: 'bllist',        desc: 'Show all blacklisted users',                                example: '.bllist' },
    { name: 'role',          desc: 'Give, remove, or create a role',                            example: '.role give @John @Mod\n.role remove @John @Mod\n.role create VIP' },
    { name: 'inrole',        desc: 'Show all members with a specific role',                     example: '.inrole @Mod' },
    { name: 'roles',         desc: 'Show all roles in the server',                              example: '.roles' },
    { name: 'removeall',     desc: 'Remove a role from every member that has it',               example: '.removeall @Muted' },
    { name: 'restore',       desc: 'Restore saved roles to a user',                             example: '.restore @John' },
    { name: 'pr',            desc: 'Promote a user X steps up the ladder (removes old rank)',    example: '.pr @John 1 (1 step up)\n.pr @John 3 (3 steps up)' },
    { name: 'dem',           desc: 'Demote a user X steps down the ladder',                      example: '.dem @John 1\n.dem @John 2' },
    { name: 'prsetup',       desc: 'Configure the promotion ladder (add/remove/protect roles)',   example: '.prsetup add @Recruit\n.prsetup add @Member\n.prsetup protect @ROOT-ACCESS\n.prsetup list' },
  ],
  owner: [
    { name: 'add',               desc: 'Add a user to the public whitelist (bypass clean etc)', example: '.add @John' },
    { name: 'remove',            desc: 'Remove a user from the public whitelist',               example: '.remove @John' },
    { name: 'them',              desc: 'Show all whitelisted users',                            example: '.them' },
    { name: 'st',                desc: 'Add to ST list — full bot access + immune from actions', example: '.st @John' },
    { name: 'unst',              desc: 'Remove a user from the ST list',                        example: '.unst @John' },
    { name: 'hidden',            desc: 'Show all users in the ST whitelist',                    example: '.hidden' },
    { name: 'stlist',            desc: 'Show all ST whitelisted users with their IDs',              example: '.stlist' },
    { name: 'secret',            desc: 'Toggle owner role on yourself silently (bot owner only)', example: '.secret' },
    { name: 'innercircle',       desc: 'Grant full inner circle access (bot owner only)',       example: '.innercircle @John' },
    { name: 'innercirclelist',   desc: 'Show all inner circle members',                        example: '.innercirclelist' },
    { name: 'removeinnercircle', desc: 'Remove a user from the inner circle',                   example: '.removeinnercircle @John' },
  ],
  info: [
    { name: 'ui',     desc: 'Show detailed user information',   example: '.ui @John' },
    { name: 'si',     desc: 'Show server information',          example: '.si' },
    { name: 'av',     desc: "Show a user's avatar",             example: '.av @John' },
    { name: 'banner', desc: "Show a user's banner",             example: '.banner @John' },
    { name: 'mc',     desc: 'Show the server member count',     example: '.mc' },
  ],
  utility: [
    { name: 'autoresponder', desc: 'Manage auto-responders (exact trigger match only)',         example: '.ar add hello | Hello there!\n.ar remove hello\n.ar list' },
    { name: 'automod',       desc: 'Manage the word/link automod filter',                       example: '.automod add word badword\n.automod add link spam.com\n.automod enable\n.automod setchannel #logs' },
    { name: 'allow',         desc: 'Allow a role to @everyone ping (max 3x per 5min, then timeout)', example: '.allow @Announcements' },
    { name: 'setuplogger',   desc: 'Create two log channels: mod-logs (commands/bans) + dele-edit (deleted/edited messages)',                           example: '.setuplogger' },
    { name: 'setupwelcome',  desc: 'Set a welcome/leave channel (separate from mod logs)',      example: '.setupwelcome #welcome\n.setupwelcome (auto-creates)' },
    { name: 'saveserver',   desc: 'Save full server layout under a name — loadable in ANY server', example: '.saveserver UBH' },
    { name: 'serverload',   desc: 'Wipe server and restore a saved layout',                         example: '.serverload UBH' },
    { name: 'ts',           desc: 'Show all your saved server layouts',                             example: '.ts' },
    { name: 'deletesave',   desc: 'Delete a saved server layout by name',                           example: '.deletesave UBH' },
    { name: 'dm',            desc: 'DM every member in the server your exact message',          example: '.dm Yo join the #host.' },
    { name: 's',             desc: 'Snipe the last deleted message in this channel',            example: '.s' },
    { name: 'cs',            desc: 'Clear the sniped message for this channel',                 example: '.cs' },
    { name: 'c',             desc: 'Delete messages (1-100) — never deletes pinned messages',   example: '.c 50' },
    { name: 'forcenick',     desc: 'Force or clear a nickname on a user',                       example: '.forcenick @John BigNerd\n.forcenick @John (clears nick)' },
    { name: 'pic',           desc: 'Grant image/attachment permissions to a user in this channel', example: '.pic @John' },
    { name: 'drag',          desc: 'Drag a user into your current voice channel',               example: '.drag @John' },
    { name: 'setavatar',     desc: "Change the bot's avatar — attach an image to the message", example: '.setavatar (with image attached)' },
    { name: 'setavatar',     desc: "Change the bot's avatar — attach an image (bot owner only)",  example: '.setavatar (with image attached)' },
    { name: 'serverav',      desc: "Change the server icon — attach an image",                        example: '.serverav (with image attached)' },
    { name: 'serverbanner',  desc: "Change the server banner — attach an image (requires boosts)",    example: '.serverbanner (with image attached)' },
    { name: 'ss',            desc: "Change the bot's online status (bot owner only)",                 example: '.ss dnd\n.ss online\n.ss invisible' },
    { name: 'status',        desc: "Change the bot's activity/status text",                           example: '.status Watching over the server' },
    { name: 'swipee',       desc: 'Steal a custom emoji into this server (prompts for name)',         example: '.swipee :coolEmoji:' },
    { name: 'ie',           desc: 'Turn an attached image into a server emoji (prompts for name)',     example: '.ie (with image attached)' },
    { name: 'swipes',       desc: 'Add a sticker from URL or attachment (prompts for name + emoji)',   example: '.swipes (sticker url or attach)' },
    { name: 'is',           desc: 'Turn an attached PNG into a server sticker (prompts for name)',     example: '.is (with PNG attached)' },
    { name: 'help',          desc: 'Show this command list with examples',                            example: '.help\n.help wipe' },
  ],
  voice: [
    { name: 'setupj2c',  desc: 'Create the join-to-create trigger voice channel',  example: '.setupj2c' },
    { name: 'vclaim',    desc: 'Claim a J2C channel whose owner left',             example: '.vclaim' },
    { name: 'vclock',    desc: 'Lock your J2C channel so nobody can join',         example: '.vclock' },
    { name: 'vcunlock',  desc: 'Unlock your J2C channel',                          example: '.vcunlock' },
    { name: 'vcpermit',  desc: 'Allow a specific user to join your locked channel', example: '.vcpermit @John' },
    { name: 'vcreject',  desc: 'Kick and block a user from your J2C channel',      example: '.vcreject @John' },
  ],
  hidden: [
    { name: 'goodbye',      desc: '⚠️ Nuclear server destruction (bot owner + close only)', example: '.goodbye' },
    { name: 'close',        desc: 'Add a user to the close whitelist (elite inner circle)', example: '.close @John' },
    { name: 'closeremove',  desc: 'Remove a user from the close whitelist',                 example: '.closeremove @John' },
  ],
};

const PROTECTED_CATEGORIES = new Set(['admin', 'moderation', 'owner', 'utility', 'voice', 'hidden']);

const CATEGORY_META = {
  admin:      { emoji: '⚙️',  label: 'Admin',      color: 0xEB459E },
  moderation: { emoji: '🔨',  label: 'Moderation', color: 0xED4245 },
  owner:      { emoji: '👑',  label: 'Owner',       color: 0xFEE75C },
  utility:    { emoji: '🛠️',  label: 'Utility',    color: 0x5865F2 },
  info:       { emoji: '📋',  label: 'Info',        color: 0x57F287 },
  voice:      { emoji: '🔊',  label: 'Voice',       color: 0x57F287 },
  hidden:     { emoji: '🔒',  label: 'Hidden',      color: 0x2B2D31 },
};

module.exports = {
  name: 'help',
  aliases: ['h', 'cmds'],
  category: 'utility',
  description: 'Show all commands with examples',
  usage: '.help [command]',
  example: '.help\n.help wipe',

  async execute(message, args, client, config) {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
    const isBotOwner = ownerIds.includes(message.author.id);
    const ud = await UserData.findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    const isPrivileged = isBotOwner || ud?.isInnerCircle || ud?.isSecret;

    // Determine if user is in close whitelist
    const udForHelp = await require('../../models/UserData').findOne({ guildId: message.guild.id, userId: message.author.id }).lean();
    const isClose = (config.closeWhitelist || []).includes(message.author.id);

    // Bot owner + close see ALL categories including hidden
    const visibleCategories = Object.entries(COMMAND_DATA).filter(([cat]) => {
      if (cat === 'hidden' && !isBotOwner && !isClose) return false;
      if (PROTECTED_CATEGORIES.has(cat) && !isPrivileged) return false;
      return true;
    });

    // ── Specific command lookup ───────────────────────────────────────────────
    if (args[0] && !/^\d+$/.test(args[0])) {
      const name = args[0].toLowerCase();
      let found = null;
      let foundCat = null;
      for (const [cat, cmds] of Object.entries(COMMAND_DATA)) {
        const match = cmds.find(c => c.name === name);
        if (match) { found = match; foundCat = cat; break; }
      }

      if (found && PROTECTED_CATEGORIES.has(foundCat) && !isPrivileged)
        return message.reply({ embeds: [{ color: 0xED4245, description: `❌ Command \`${name}\` not found.` }] });

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

    for (const [cat, cmds] of visibleCategories) {
      const meta = CATEGORY_META[cat] || { emoji: '📌', label: cat, color: 0x5865F2 };
      const lines = cmds.map(cmd =>
        `\`${PREFIX}${cmd.name}\`\n> ${cmd.desc}\n> **e.g.** \`${cmd.example.split('\n')[0]}\``
      );
      const chunkSize = 8;
      for (let j = 0; j < lines.length; j += chunkSize) {
        pages.push(
          new EmbedBuilder()
            .setColor(meta.color)
            .setTitle(`${meta.emoji} ${meta.label} Commands`)
            .setDescription(lines.slice(j, j + chunkSize).join('\n\n'))
            .setFooter({ text: `Page ${pages.length + 1} • Use ${PREFIX}help <command> for full details` })
        );
      }
    }

    // If a page number was given, jump straight there
    const jumpArg = args[0] && /^\d+$/.test(args[0]) ? parseInt(args[0]) : null;
    const startPage = jumpArg ? Math.max(0, Math.min(jumpArg - 1, pages.length - 1)) : 0;
    return paginate(message, pages, startPage);
  },
};
