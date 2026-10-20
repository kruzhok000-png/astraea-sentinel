import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ApplicationService } from '../src/services/application-service.js';

const enabled = process.env.RUN_DB_TESTS === '1';
describe.skipIf(!enabled)('PostgreSQL integration (dedicated test database only)', () => {
  let db: PrismaClient;
  let service: ApplicationService;
  const guildId = `test-${randomUUID()}`;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw new Error('Database name must end with _test');
    db = new PrismaClient(); await db.$connect(); service = new ApplicationService(db);
    await db.guildConfig.create({ data: { guildId } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { guildId } });
    await db.applicantState.deleteMany({ where: { guildId } });
    await db.application.deleteMany({ where: { guildId } });
    await db.guildConfig.deleteMany({ where: { guildId } });
    await db.$disconnect();
  });
  it('parallel draft creation produces exactly one active application', async () => {
    await Promise.allSettled(Array.from({ length: 8 }, () => service.getOrCreateDraft(guildId, '1388985537649578116')));
    expect(await db.application.count({ where: { guildId, applicantId: '1388985537649578116', status: 'DRAFT' } })).toBe(1);
  });
  it('parallel submit and claim each have exactly one winner', async () => {
    const app = await service.getOrCreateDraft(guildId, '794867229672996865');
    await service.updateProfile(app.id, app.applicantId, { gameNickname: 'Player', projectServer: 'Server', timezone: 'UTC+3', ageRange: '18–24' });
    await service.updateMotivation(app.id, app.applicantId, { motivation: 'Team', contribution: 'Raids', weeklyActivity: '10h' });
    await service.updateConfirmation(app.id, app.applicantId, { acceptedRules: true, confirmedHonesty: true });
    const sent = await Promise.allSettled([service.submit(app.id, app.applicantId, 72), service.submit(app.id, app.applicantId, 72)]);
    expect(sent.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const claimed = await Promise.allSettled([service.claim(app.id, 'reviewer1'), service.claim(app.id, 'reviewer2')]);
    expect(claimed.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await service.transition(app.id, 'reviewer1', 'APPROVED', 'Approved by test');
    expect(await db.auditLog.count({ where: { applicationId: app.id, toStatus: 'APPROVED' } })).toBe(1);
    expect((await db.applicantState.findUniqueOrThrow({ where: { guildId_userId: { guildId, userId: app.applicantId } } })).activeApplicationId).toBeNull();
  });
});
