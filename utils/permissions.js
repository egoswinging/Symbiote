const GuildConfig = require('../models/GuildConfig');
const UserData = require('../models/UserData');

async function getPermTier(member, config = null) {
  // Bot owner always wins
  const ownerIds = (process.env.OWNER_IDS || '').split(',').map(s => s.trim());
  if (ownerIds.includes(member.id)) return 'bot_owner';

  // Server owner
  if (member.guild.ownerId === member.id) return 'owner';

  if (!config) config = await GuildConfig.findOne({ guildId: member.guild.id });
  if (!config) return 'member';

  const roleIds = member.roles.cache.map(r => r.id);

  // Inner circle — full control, below bot_owner only
  const ud = await UserData.findOne({ guildId: member.guild.id, userId: member.id }).lean();
  if (ud?.isInnerCircle) return 'inner_circle';

  if (config.ownerRole && roleIds.includes(config.ownerRole)) return 'owner';
  if (config.v1Roles.some(r => roleIds.includes(r))) return 'v1';
  if (config.v2Roles.some(r => roleIds.includes(r))) return 'v2';
  if (config.v3Roles.some(r => roleIds.includes(r))) return 'v3';
  if (member.permissions.has('Administrator')) return 'v1';
  if (member.permissions.has('ManageMessages')) return 'mod';

  return 'member';
}

const TIER_RANK = {
  bot_owner:    7,
  owner:        6,
  inner_circle: 5,
  v1:           4,
  v2:           3,
  v3:           2,
  mod:          1,
  member:       0,
};

function tierRank(tier) { return TIER_RANK[tier] ?? 0; }

async function canTarget(actorMember, victimMember, config = null) {
  // .st users cannot be targeted unless actor is inner_circle or bot_owner
  const vud = await UserData.findOne({ guildId: victimMember.guild.id, userId: victimMember.id }).lean();
  const aud = await UserData.findOne({ guildId: actorMember.guild.id, userId: actorMember.id }).lean();
  const actorTier = await getPermTier(actorMember, config);

  if (vud?.isSecret && actorTier !== 'bot_owner' && actorTier !== 'inner_circle') return false;

  const [aT, vT] = await Promise.all([
    Promise.resolve(actorTier),
    getPermTier(victimMember, config),
  ]);
  return tierRank(aT) > tierRank(vT);
}

async function requireTier(member, minTier, config = null) {
  const tier = await getPermTier(member, config);
  return tierRank(tier) >= tierRank(minTier);
}

module.exports = { getPermTier, tierRank, canTarget, requireTier };
