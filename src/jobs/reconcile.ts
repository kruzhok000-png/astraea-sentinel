import type { Client } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { DiscordDelivery } from '../services/discord-delivery.js';
import type { Application } from '@prisma/client';

/** Single-process recovery for committed applications whose Discord delivery failed. */
export function startReconciliation(client: Client) {
  let running = false;
  let stopping = false;
  let task: Promise<void> = Promise.resolve();
  const run = async () => {
    if (running || stopping) return;
    running = true;
    try {
      const delivery = new DiscordDelivery(client);
      const pending = await prisma.application.findMany({ where: { submittedAt: { not: null }, OR: [{ moderationMessageId: null }, { threadId: null }] }, take: 25, orderBy: { createdAt: 'asc' } });
      for (const app of pending) {
        try { await delivery.publishApplication(app); }
        catch (err) { logger.error({ err, applicationId: app.id }, 'Delivery recovery failed'); }
      }
      const dirty = await prisma.$queryRaw<Application[]>`
        SELECT * FROM "Application"
        WHERE "submittedAt" IS NOT NULL AND (
          "modSyncedVersion" < "version" OR (
            "dmSyncedVersion" < "version" AND
            ("lastDmAttemptAt" IS NULL OR "lastDmAttemptAt" < NOW() - INTERVAL '30 minutes')
          )
        ) ORDER BY "updatedAt" ASC LIMIT 25`;
      for (const app of dirty) {
        try {
          if (app.dmSyncedVersion < app.version && (!app.lastDmAttemptAt || Date.now() - app.lastDmAttemptAt.getTime() > 1800000)) await delivery.updateDmStatus(app);
          if (app.modSyncedVersion < app.version) await delivery.refreshModeration(app);
        } catch (err) { logger.warn({ err, applicationId: app.id }, 'Status synchronization pending'); }
      }
      const approved = await prisma.application.findMany({ where: { status: 'APPROVED', audits: { none: { action: 'ROLE_GRANTED' } } }, take: 25 });
      for (const app of approved) {
        try {
          const audit = await prisma.auditLog.findFirst({ where: { applicationId: app.id, toStatus: 'APPROVED' }, orderBy: { createdAt: 'desc' } });
          await delivery.grantConfiguredRoles(app, audit?.actorId ?? client.user!.id);
          await delivery.updateDmStatus(app);
          await delivery.sendDecision(app, 'approved');
        } catch (err) { logger.warn({ err, applicationId: app.id }, 'Role recovery pending'); }
      }
    } catch (err) { logger.error({ err }, 'Recovery worker failed'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { task = run(); }, 60000);
  timer.unref();
  return async () => { stopping = true; clearInterval(timer); await task; };
}
