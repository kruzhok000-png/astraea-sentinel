import { describe, expect, it } from 'vitest';
import { configuredRoleIds } from '../src/services/role-policy.js';

describe('approval role plan', () => {
  it('grants only configured roles and removes duplicates', () => {
    expect(configuredRoleIds({ memberRoleId: 'member', defaultGameRoleId: 'game' })).toEqual(['member', 'game']);
    expect(configuredRoleIds({ memberRoleId: 'member', defaultGameRoleId: 'member' })).toEqual(['member']);
    expect(configuredRoleIds({ memberRoleId: null, defaultGameRoleId: null })).toEqual([]);
  });
});
