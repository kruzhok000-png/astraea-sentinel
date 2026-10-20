import { describe, expect, it } from 'vitest';
import { hasPermission, highestPermission } from '../src/services/permissions.js';

const cfg = { curatorRoleId: 'curator', moderatorRoleId: 'moderator', seniorModeratorRoleId: 'senior', applicationAdminRoleId: 'app-admin' };
describe('application permissions', () => {
  it('gives a trusted identity only Application Admin inside the bot', () => {
    expect(highestPermission('trusted', [], cfg as never, new Set(['trusted']))).toBe('APPLICATION_ADMIN');
  });
  it('uses the highest configured Discord role', () => {
    expect(highestPermission('user', ['curator', 'moderator'], cfg as never, new Set())).toBe('MODERATOR');
    expect(hasPermission('MODERATOR', 'CURATOR')).toBe(true);
    expect(hasPermission('CURATOR', 'MODERATOR')).toBe(false);
  });
});
