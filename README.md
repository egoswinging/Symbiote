# 🤖 Discord Moderation Bot

A production-grade Discord moderation and utility bot built with Discord.js v14 and MongoDB. Feature-complete alternative to Bleed bot — cleaner, safer, and fully customizable.

---

## 📦 Tech Stack

- **Runtime:** Node.js 18+
- **Library:** Discord.js v14
- **Database:** MongoDB (via Mongoose)
- **Prefix:** `,` (configurable via `.env`)

---

## 🚀 Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd discord-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
TOKEN=your_discord_bot_token
MONGO_URI=mongodb://localhost:27017
PREFIX=,
OWNER_IDS=your_discord_user_id
```

> `OWNER_IDS` supports multiple IDs separated by commas: `123,456,789`

### 3. Invite the Bot

When creating the bot on the [Discord Developer Portal](https://discord.com/developers/applications):
- Enable **Message Content Intent**
- Enable **Server Members Intent**
- Enable **Presence Intent**
- Required permissions: `Administrator` (for full functionality)

### 4. Start

```bash
npm start
# or for development with auto-restart:
npm run dev
```

---

## 📁 Project Structure

```
discord-bot/
├── index.js                    # Entry point
├── .env.example                # Environment template
├── package.json
│
├── handlers/
│   ├── commandHandler.js       # Loads all prefix commands
│   └── eventHandler.js         # Loads all event listeners
│
├── models/                     # MongoDB schemas
│   ├── GuildConfig.js          # Per-guild settings
│   ├── UserData.js             # User punishment/list data
│   ├── AutoResponder.js        # Auto-responder triggers
│   ├── Backup.js               # Server layout backups
│   └── AntiNukeLog.js          # Anti-nuke audit trail
│
├── events/
│   ├── ready.js                # Bot startup
│   ├── messageCreate.js        # Command router + clean mode + autoresponder
│   ├── messageDelete.js        # Snipe system
│   ├── antiNuke.js             # Anti-nuke event listeners
│   └── voiceStateUpdate.js     # J2C voice system
│
├── commands/
│   ├── admin/                  # Admin/config commands
│   │   ├── on.js               # ,on
│   │   ├── off.js              # ,off
│   │   ├── strip.js            # ,strip
│   │   ├── roleadd.js          # ,roleadd
│   │   ├── roleremove.js       # ,roleremove
│   │   ├── setrole.js          # ,setrole
│   │   ├── resetrole.js        # ,resetrole
│   │   ├── showconfig.js       # ,showconfig
│   │   ├── rolelist.js         # ,rolelist
│   │   └── antinuke.js         # ,antinuke
│   │
│   ├── moderation/             # Moderation commands
│   │   ├── nuke.js             # ,nuke
│   │   ├── clean.js            # ,clean
│   │   ├── vanish.js           # ,vanish ,unvanish ,vanishlist ,setupvanish
│   │   ├── wipe.js             # ,wipe ,unwipe ,wipelist ,restore
│   │   ├── blacklist.js        # ,blacklist ,bllist
│   │   ├── zip.js              # ,zip
│   │   ├── mod.js              # ,ban ,kick ,timeout ,unbanall ,modlogs
│   │   └── roles.js            # ,role ,inrole ,roles ,removeall
│   │
│   ├── owner/
│   │   └── whitelist.js        # ,add ,remove ,them ,shh ,unshh ,hidden ,secret
│   │
│   ├── info/
│   │   └── info.js             # ,ui ,si ,av ,banner ,mc
│   │
│   ├── utility/
│   │   ├── autoresponder.js    # ,autoresponder (,ar)
│   │   ├── setuplogger.js      # ,setuplogger
│   │   ├── backup.js           # ,saveserver ,serverload ,resetsave
│   │   ├── utils.js            # ,s ,cs ,c ,forcenick ,pic ,drag
│   │   └── help.js             # ,help
│   │
│   └── voice/
│       └── voice.js            # ,setupj2c ,vclaim ,vclock ,vcunlock ,vcpermit ,vcreject
│
└── utils/
    ├── embeds.js               # Embed builders + paginator
    ├── permissions.js          # Tier-based permission system
    ├── logger.js               # Mod action logger
    ├── helpers.js              # resolveMember, chunk, cooldowns, bulkDelete
    └── antiNukeTracker.js      # In-memory action rate tracker
```

---

## 🔑 Permission Tiers

| Tier | Who |
|------|-----|
| `bot_owner` | OWNER_IDS in `.env` |
| `owner` | Guild owner + owner role |
| `v1` | Highest admin tier |
| `v2` | Mid admin tier |
| `v3` | Low admin tier |
| `mod` | Members with Manage Messages |
| `member` | Everyone else |

---

## 📋 Full Command List

### ⚙️ Admin
| Command | Description | Tier |
|---------|-------------|------|
| `,on <v1\|v2\|v3> <@user>` | Grant admin tier roles | Owner |
| `,off <v1\|v2\|v3> <@user>` | Remove admin tier roles | Owner |
| `,strip <@user>` | Remove ALL admin roles | Owner |
| `,roleadd <v1\|v2\|v3> <@role>` | Add role to tier config | Owner |
| `,roleremove <v1\|v2\|v3> <@role>` | Remove role from tier | Owner |
| `,setrole <owner\|vanish\|access> <@role>` | Set special roles | Owner |
| `,resetrole <type>` | Reset a role config key | Owner |
| `,showconfig` | Show guild config | V3 |
| `,rolelist <v1\|v2\|v3>` | List roles per tier | V3 |
| `,antinuke <sub>` | Anti-nuke system management | Owner |

### 🔨 Moderation
| Command | Description | Tier |
|---------|-------------|------|
| `,nuke` | Clone + delete current channel | V2 |
| `,clean` | Toggle auto-delete mode in channel | V2 |
| `,vanish <@user>` | Remove all roles, apply vanish role | V2 |
| `,unvanish <@user>` | Restore vanished user | V2 |
| `,vanishlist` | Show all vanished users | V3 |
| `,setupvanish` | Apply vanish perms to all channels | Owner |
| `,wipe <@user>` | Remove all roles, save them | V2 |
| `,unwipe <@user>` | Restore wiped user's roles | V2 |
| `,wipelist` | Show all wiped users | V3 |
| `,restore <@user>` | Restore saved roles | V2 |
| `,blacklist <@user>` | Block user from bot | V2 |
| `,bllist` | Show blacklisted users | V3 |
| `,zip <@user> [min]` | Delete messages + optional timeout | V2 |
| `,ban <@user> [reason]` | Ban a member | V1 |
| `,kick <@user> [reason]` | Kick a member | V2 |
| `,timeout <@user> <min>` | Timeout a member | V3 |
| `,unbanall` | Unban everyone + reset wipes | Owner |
| `,modlogs <@user>` | View mod history | V3 |
| `,role <give\|remove\|create>` | Manage roles | V2 |
| `,inrole <@role>` | Members with a role | Any |
| `,roles` | All server roles | Any |
| `,removeall <@role>` | Remove role from all members | V1 |

### 👑 Owner
| Command | Description | Tier |
|---------|-------------|------|
| `,add <@user>` | Add to public whitelist | Owner |
| `,remove <@user>` | Remove from whitelist | Owner |
| `,them` | Show whitelisted users | V3 |
| `,shh <@user>` | Add to secret whitelist | Owner |
| `,unshh <@user>` | Remove from secret whitelist | Owner |
| `,hidden` | Show secret whitelisted users | Owner |
| `,secret` | Toggle owner role on yourself | Bot Owner |

### 📋 Info
| Command | Description |
|---------|-------------|
| `,ui [@user]` | User info |
| `,si` | Server info |
| `,av [@user]` | Show avatar |
| `,banner [@user]` | Show banner |
| `,mc` | Member count |

### 🛠️ Utility
| Command | Description | Tier |
|---------|-------------|------|
| `,ar <add\|remove\|list>` | Auto-responder management | V2 |
| `,setuplogger` | Create/set log channel | Owner |
| `,saveserver` | Backup server layout | Owner |
| `,serverload` | Restore server layout | Owner |
| `,resetsave` | Delete server backup | Owner |
| `,s` | Snipe last deleted message | Any |
| `,cs` | Clear snipe | V3 |
| `,c <amount>` | Delete messages (1-100) | V3 |
| `,forcenick <@user> [nick]` | Force/clear nickname | V2 |
| `,pic <@user>` | Grant image perms in channel | V3 |
| `,drag <@user>` | Move user to your VC | V3 |
| `,help [cmd]` | Show all commands | Any |

### 🔊 Voice (J2C)
| Command | Description |
|---------|-------------|
| `,setupj2c` | Setup join-to-create channel |
| `,vclaim` | Claim ownerless J2C channel |
| `,vclock` | Lock your J2C channel |
| `,vcunlock` | Unlock your J2C channel |
| `,vcpermit <@user>` | Permit user to join |
| `,vcreject <@user>` | Reject + kick user from channel |

---

## 🛡️ Anti-Nuke

Configure with `,antinuke`:

```
,antinuke enable
,antinuke set channelDelete 3
,antinuke set roleDelete 3
,antinuke set ban 3
,antinuke set kick 5
,antinuke set punishment ban
,antinuke whitelist add @user
,antinuke config
```

**Punishments:** `removeRoles` | `kick` | `ban` | `vanish`

When a non-whitelisted user exceeds the threshold for any action in a 10-second window, the punishment is immediately applied.

---

## 🗄️ MongoDB Collections

| Collection | Purpose |
|-----------|---------|
| `guildconfigs` | Per-guild settings, roles, anti-nuke config |
| `userdatas` | User punishments, wipe/vanish/whitelist state |
| `autoresponders` | Keyword → response mappings |
| `backups` | Full server channel/role snapshots |
| `antinukelogs` | Anti-nuke audit trail |

---

## 🔒 Security Notes

- Bot owner IDs are read from `.env` — never from Discord roles
- All permission checks happen server-side before any action
- Anti-nuke whitelist is per-guild
- Blacklisted users cannot use ANY commands
- Rate limiting via in-memory cooldown tracker
- All role operations validate hierarchy before executing

---

## 🧩 Adding Commands

Create a new `.js` file in any category folder under `/commands/`:

```js
module.exports = {
  name: 'mycommand',
  aliases: ['mc'],
  category: 'utility',
  description: 'Does something cool',
  usage: ',mycommand <arg>',

  async execute(message, args, client, config) {
    // message  = Discord Message object
    // args     = string[] of arguments
    // client   = Discord Client (has .commands, .snipes, .cleanChannels, .j2cOwners)
    // config   = GuildConfig document from MongoDB
    return message.reply('Hello!');
  },
};
```

It will be automatically loaded on next start. Export an **array** of objects to put multiple commands in one file.

---

## 📝 License

MIT — use freely, give credit if you ship it publicly.
