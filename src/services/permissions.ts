import type { GuildConfig } from '@prisma/client';

export type PermissionName = 'APPLICANT' | 'CURATOR' | 'MODERATOR' | 'SENIOR_MODERATOR' | 'APPLICATION_ADMIN';
const rank: Record<PermissionName, number> = {
  APPLICANT: 0,
  CURATOR: 1,
  MODERATOR: 2,
  SENIOR_MODERATOR: 3,
  APPLICATION_ADMIN: 4,
};

export function highestPermission(
  userId: string,
  roleIds: Iterable<string>,
  guild: Pick<GuildConfig, 'curatorRoleId' | 'moderatorRoleId' | 'seniorModeratorRoleId' | 'applicationAdminRoleId'>,
  trustedAdminIds: ReadonlySet<string>,
): PermissionName {
  if (trustedAdminIds.has(userId)) return 'APPLICATION_ADMIN';
  const roles = new Set(roleIds);
  if (guild.applicationAdminRoleId && roles.has(guild.applicationAdminRoleId)) return 'APPLICATION_ADMIN';
  if (guild.seniorModeratorRoleId && roles.has(guild.seniorModeratorRoleId)) return 'SENIOR_MODERATOR';
  if (guild.moderatorRoleId && roles.has(guild.moderatorRoleId)) return 'MODERATOR';
  if (guild.curatorRoleId && roles.has(guild.curatorRoleId)) return 'CURATOR';
  return 'APPLICANT';
}

export const hasPermission = (actual: PermissionName, required: PermissionName): boolean => rank[actual] >= rank[required];
