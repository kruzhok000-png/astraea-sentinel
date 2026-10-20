export function configuredRoleIds(cfg: { memberRoleId: string | null; defaultGameRoleId: string | null }): string[] {
  return [...new Set([cfg.memberRoleId, cfg.defaultGameRoleId].filter((id): id is string => Boolean(id)))];
}

export interface RoleRecipient {
  roles: { cache: { has(id: string): boolean }; add(id: string, reason: string): Promise<unknown> };
}

/** Idempotent for already-held roles; never assigns anything to a departed user. */
export async function applyRolePlan(member: RoleRecipient | null, roleIds: readonly string[], reason: string): Promise<string[]> {
  if (!member) throw new Error('Пользователь больше не состоит на сервере; роли не выданы.');
  if (!roleIds.length) throw new Error('Роль Member не настроена.');
  const granted = [...new Set(roleIds)];
  for (const id of granted) if (!member.roles.cache.has(id)) await member.roles.add(id, reason);
  return granted;
}
