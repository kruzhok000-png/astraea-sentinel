import { describe, expect, it, vi } from 'vitest';
import { ApplicationService } from '../src/services/application-service.js';

function setup(status = 'IN_REVIEW') {
  const app = { id: 'app', guildId: 'guild', applicantId: 'candidate', status, version: 3,
    gameNickname: 'Player', projectServer: 'Server', timezone: 'UTC+3', ageRange: '18–24', motivation: 'Team', contribution: 'Raids', weeklyActivity: '10 hours', acceptedRules: true, confirmedHonesty: true, cooldownUntil: null };
  const tx = {
    application: { findUnique: vi.fn().mockResolvedValue(app), findFirst: vi.fn().mockResolvedValue(app), findFirstOrThrow: vi.fn().mockResolvedValue(app), findUniqueOrThrow: vi.fn().mockResolvedValue(app), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue(app) },
    applicantState: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn().mockResolvedValue({ id: 'state', activeApplicationId: null, cooldownUntil: new Date(Date.now() + 100000) }) },
    applicationBan: { findUnique: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    guildConfig: { findUniqueOrThrow: vi.fn().mockResolvedValue({ appealsEnabled: false }) },
  };
  const db = { ...tx, $transaction: vi.fn((fn) => fn(tx)) };
  return { app, tx, service: new ApplicationService(db as never) };
}
describe('transactional application lifecycle', () => {
  it('duplicate submission cannot transition an already submitted application', async () => {
    const { service, tx } = setup('NEW');
    await expect(service.submit('app', 'candidate', 72)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(tx.application.updateMany).not.toHaveBeenCalled();
  });
  it('losing a submission version race does not write an audit event', async () => {
    const { service, tx } = setup('DRAFT'); tx.application.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit('app', 'candidate', 72)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('banned candidate cannot submit an old draft', async () => {
    const { service, tx } = setup('DRAFT'); tx.applicationBan.findUnique.mockResolvedValue({ expiresAt: null });
    await expect(service.submit('app', 'candidate', 72)).rejects.toMatchObject({ code: 'BANNED' });
  });
  it('cooldown prevents creating another application', async () => {
    const { service } = setup(); await expect(service.getOrCreateDraft('guild','candidate')).rejects.toMatchObject({ code: 'COOLDOWN' });
  });
  it.each(['REJECTED','NEEDS_INFO','ON_HOLD'] as const)('%s requires a reason', async (status) => {
    const { service, tx } = setup(); await expect(service.transition('app','moderator',status,'   ')).rejects.toMatchObject({ code: 'INCOMPLETE' });
    expect(tx.application.updateMany).not.toHaveBeenCalled();
  });
  it('approval records actor and reason and releases the active slot atomically', async () => {
    const { service, tx } = setup(); await service.transition('app','moderator','APPROVED','Meets requirements');
    expect(tx.application.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'app', version: 3 }, data: expect.objectContaining({ status: 'APPROVED' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'moderator', reason: 'Meets requirements', fromStatus: 'IN_REVIEW', toStatus: 'APPROVED' }) });
    expect(tx.applicantState.update).toHaveBeenCalled();
  });
  it('an approved application cannot be rejected by a stale click', async () => {
    const { service, tx } = setup('APPROVED'); await expect(service.transition('app','moderator','REJECTED','stale')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(tx.application.updateMany).not.toHaveBeenCalled();
  });
  it('second moderator cannot win a claim race', async () => {
    const { service, tx } = setup('NEW'); tx.application.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.claim('app','second')).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('disabled appeals cannot reserve the active application slot', async () => {
    const { service, tx } = setup('REJECTED'); await expect(service.appeal('app','candidate','please reconsider')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(tx.applicantState.updateMany).not.toHaveBeenCalled();
  });
});
