import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highestPermission, hasPermission } from '../src/services/permissions.ts';
import { applyRolePlan, configuredRoleIds } from '../src/services/role-policy.ts';
import { customId, parseCustomId } from '../src/lib/custom-id.ts';

const cfg = { curatorRoleId: 'c', moderatorRoleId: 'm', seniorModeratorRoleId: 's', applicationAdminRoleId: 'a' };
test('trusted administrator needs no Discord administrative role', () => assert.equal(highestPermission('trusted', [], cfg, new Set(['trusted'])), 'APPLICATION_ADMIN'));
test('unknown role has no staff permissions', () => assert.equal(highestPermission('user', ['administrator'], cfg, new Set()), 'APPLICANT'));
test('curator cannot approve', () => assert.equal(hasPermission('CURATOR', 'MODERATOR'), false));
test('highest configured role wins', () => assert.equal(highestPermission('user', ['c','s'], cfg, new Set()), 'SENIOR_MODERATOR'));
test('only configured role IDs enter the grant plan', () => assert.deepEqual(configuredRoleIds({ memberRoleId: 'member', defaultGameRoleId: 'member' }), ['member']));
test('departed member gets no role', async () => assert.rejects(() => applyRolePlan(null, ['member'], 'approval')));
test('approval grants missing role once', async () => {
  const existing = new Set(); const calls = [];
  const member = { roles: { cache: existing, add: async (id, reason) => { calls.push([id, reason]); existing.add(id); } } };
  await applyRolePlan(member, ['member', 'game'], 'approved by moderator');
  await applyRolePlan(member, ['member', 'game'], 'retry');
  assert.deepEqual(calls, [['member', 'approved by moderator'], ['game', 'approved by moderator']]);
});
test('grant errors propagate for recovery', async () => {
  const member = { roles: { cache: new Set(), add: async () => { throw new Error('Missing permissions'); } } };
  await assert.rejects(() => applyRolePlan(member, ['member'], 'approved'), /Missing permissions/);
});
test('custom IDs round-trip and foreign components are rejected', () => {
  assert.deepEqual(parseCustomId(customId('claim', 'app_123')), { action: 'claim', applicationId: 'app_123' });
  assert.equal(parseCustomId('another:claim:app_123'), null);
});
