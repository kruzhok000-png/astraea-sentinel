import { expect, it } from 'vitest';
import { profileSchema, motivationSchema } from '../src/services/validation.js';
it('rejects exact birthdates and whitespace-only answers', () => {
  expect(profileSchema.safeParse({ gameNickname: 'player', projectServer: 'server', timezone: 'UTC+3', ageRange: '2000-01-01' }).success).toBe(false);
  expect(motivationSchema.safeParse({ motivation: '   ', contribution: 'help', weeklyActivity: '10h' }).success).toBe(false);
});
it('rejects executable profile URLs', () => {
  expect(motivationSchema.safeParse({ motivation: 'team', contribution: 'help', weeklyActivity: '10h', profileUrl: 'javascript:alert(1)' }).success).toBe(false);
});
