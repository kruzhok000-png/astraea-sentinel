import { describe, expect, it } from 'vitest';
import type { Application, ApplicationStatus } from '@prisma/client';
import { dmStatusCard, moderationCard, previewCard, publicPanel } from '../src/ui/cards.js';

function fixture(status: ApplicationStatus = 'IN_REVIEW'): Application {
  return {
    id: 'app123', number: 42, guildId: '1389355523316519002', applicantId: '1388985537649578116', status,
    gameNickname: 'А'.repeat(80), projectServer: 'Б'.repeat(100), timezone: 'UTC+3', ageRange: '18–24',
    previousExperience: 'В'.repeat(700), motivation: 'Г'.repeat(900), contribution: 'Д'.repeat(900), weeklyActivity: 'Е'.repeat(100),
    profileUrl: 'https://example.com/' + 'a'.repeat(270), contact: 'Ж'.repeat(200), acceptedRules: true, confirmedHonesty: true,
    assignedModeratorId: null, reason: 'З'.repeat(900), submittedAt: new Date(), reviewDeadlineAt: new Date(), cooldownUntil: new Date(),
    dmChannelId: null, dmStatusMessageId: null, moderationChannelId: null, moderationMessageId: null, threadId: null,
    suspicionFlags: [], version: 0, dmSyncedVersion: -1, modSyncedVersion: -1, lastDmAttemptAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('Discord cards and mobile UX', () => {
  it('serializes every card at maximum answer lengths within Discord limits', () => {
    for (const card of [publicPanel(), previewCard(fixture('DRAFT')), moderationCard(fixture()), dmStatusCard(fixture('REJECTED'), true)]) {
      const embeds = card.embeds.map((embed) => embed.toJSON());
      let total = 0;
      for (const embed of embeds) {
        total += (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
        for (const field of embed.fields ?? []) {
          expect(field.value.length).toBeLessThanOrEqual(1024);
          total += field.name.length + field.value.length;
        }
      }
      expect(total).toBeLessThanOrEqual(6000);
      card.components.forEach((row) => expect(row.toJSON().components.length).toBeLessThanOrEqual(5));
    }
  });
  it('shows clarification text and appeal only when enabled', () => {
    expect(dmStatusCard(fixture('NEEDS_INFO')).embeds[0]!.toJSON().fields!.some((f) => f.name === 'Вопрос команды')).toBe(true);
    expect(dmStatusCard(fixture('REJECTED'), false).components[0]!.components.length).toBe(1);
    expect(dmStatusCard(fixture('REJECTED'), true).components[0]!.components.length).toBe(2);
  });
  it('submitted details cannot resubmit and terminal moderation actions are disabled', () => {
    expect(previewCard(fixture()).components).toHaveLength(0);
    expect(moderationCard(fixture('APPROVED')).components.slice(0, 2).every((row) => row.components.every((button) => button.data.disabled))).toBe(true);
  });
});
