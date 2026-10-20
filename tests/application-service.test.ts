import { describe, expect, it, vi } from 'vitest';
import { ApplicationService } from '../src/services/application-service.js';

describe('application anti-duplication', () => {
  it('returns the active application instead of creating another draft', async () => {
    const active = { id: 'app-1', guildId: 'g', applicantId: 'u', status: 'DRAFT' };
    const tx = {
      applicationBan: { findUnique: vi.fn().mockResolvedValue(null) },
      applicantState: { upsert: vi.fn().mockResolvedValue({ id: 's', activeApplicationId: 'app-1', cooldownUntil: null }) },
      application: { findUnique: vi.fn().mockResolvedValue(active), create: vi.fn() },
    };
    const db = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new ApplicationService(db as never);
    await expect(service.getOrCreateDraft('g', 'u')).resolves.toBe(active);
    expect(tx.application.create).not.toHaveBeenCalled();
  });
});
