import { ApplicationStatus, AuditAction, Prisma, PrismaClient } from '@prisma/client';
import { profileSchema, motivationSchema } from './validation.js';

export class ApplicationError extends Error {
  constructor(public readonly code: 'BANNED' | 'COOLDOWN' | 'ACTIVE_EXISTS' | 'NOT_FOUND' | 'INVALID_STATE' | 'ALREADY_CLAIMED' | 'INCOMPLETE', message: string) { super(message); }
}

export type ProfileInput = { gameNickname: string; projectServer: string; timezone: string; ageRange: string; previousExperience?: string };
export type MotivationInput = { motivation: string; contribution: string; weeklyActivity: string; profileUrl?: string };
export type ConfirmationInput = { acceptedRules: boolean; confirmedHonesty: boolean; contact?: string };

export class ApplicationService {
  constructor(private readonly db: PrismaClient) {}

  async getOrCreateDraft(guildId: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const ban = await tx.applicationBan.findUnique({ where: { guildId_userId: { guildId, userId } } });
      if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) throw new ApplicationError('BANNED', `Подача заявок ограничена: ${ban.reason}`);
      const state = await tx.applicantState.upsert({ where: { guildId_userId: { guildId, userId } }, create: { guildId, userId }, update: {} });
      if (state.cooldownUntil && state.cooldownUntil > new Date()) throw new ApplicationError('COOLDOWN', `Повторная подача доступна ${state.cooldownUntil.toLocaleString('ru-RU')}`);
      if (state.activeApplicationId) {
        const active = await tx.application.findUnique({ where: { id: state.activeApplicationId } });
        if (active) return active;
      }
      const accepted = await tx.application.findFirst({ where: { guildId, applicantId: userId, status: 'APPROVED' } });
      if (accepted) throw new ApplicationError('ACTIVE_EXISTS', 'Ваша заявка уже одобрена. Откройте «Мой статус».');
      const recent = await tx.application.count({ where: { guildId, applicantId: userId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (recent >= 5) throw new ApplicationError('COOLDOWN', 'Слишком много новых черновиков. Попробуйте через час.');
      const app = await tx.application.create({ data: { guildId, applicantId: userId, audits: { create: { guildId, actorId: userId, action: AuditAction.CREATED } } } });
      const claimed = await tx.applicantState.updateMany({ where: { id: state.id, activeApplicationId: null }, data: { activeApplicationId: app.id } });
      if (claimed.count !== 1) throw new ApplicationError('ACTIVE_EXISTS', 'Заявка уже создаётся. Повторите через несколько секунд.');
      return app;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  getOwned(id: string, userId: string) {
    return this.db.application.findFirst({ where: { id, applicantId: userId } });
  }

  async updateProfile(id: string, userId: string, data: ProfileInput) {
    return this.updateDraft(id, userId, profileSchema.parse(data));
  }
  async updateMotivation(id: string, userId: string, data: MotivationInput) {
    return this.updateDraft(id, userId, motivationSchema.parse(data));
  }
  async updateConfirmation(id: string, userId: string, data: ConfirmationInput) {
    return this.updateDraft(id, userId, data);
  }

  private async updateDraft(id: string, userId: string, data: Prisma.ApplicationUpdateManyMutationInput) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.application.updateMany({ where: { id, applicantId: userId, status: ApplicationStatus.DRAFT }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw new ApplicationError('INVALID_STATE', 'Черновик уже отправлен или недоступен.');
      const app = await tx.application.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({ data: { guildId: app.guildId, applicationId: id, actorId: userId, action: AuditAction.DRAFT_SAVED } });
      return app;
    });
  }

  async submit(id: string, userId: string, deadlineHours: number) {
    return this.db.$transaction(async (tx) => {
      const app = await tx.application.findFirst({ where: { id, applicantId: userId } });
      if (!app) throw new ApplicationError('NOT_FOUND', 'Заявка не найдена.');
      if (app.status !== ApplicationStatus.DRAFT) throw new ApplicationError('INVALID_STATE', 'Заявка уже была отправлена.');
      const ban = await tx.applicationBan.findUnique({ where: { guildId_userId: { guildId: app.guildId, userId } } });
      if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) throw new ApplicationError('BANNED', 'Подача заявок ограничена.');
      if (!app.gameNickname || !app.projectServer || !app.timezone || !app.ageRange || !app.motivation || !app.contribution || !app.weeklyActivity || !app.acceptedRules || !app.confirmedHonesty) throw new ApplicationError('INCOMPLETE', 'Заполните все обязательные разделы.');
      const now = new Date();
      const suspicionFlags: string[] = [];
      if (/^\d{16,20}$/.test(app.applicantId)) {
        const accountCreated = Number(BigInt(app.applicantId) >> 22n) + 1420070400000;
        if (now.getTime() - accountCreated < 7 * 86400000) suspicionFlags.push('Новый аккаунт (<7 дней); проверьте вручную');
      }
      if (app.motivation.trim().length < 20) suspicionFlags.push('Краткая мотивация; может потребоваться уточнение');
      const changed = await tx.application.updateMany({ where: { id, status: ApplicationStatus.DRAFT, version: app.version }, data: { status: ApplicationStatus.NEW, submittedAt: now, suspicionFlags, reviewDeadlineAt: new Date(now.getTime() + deadlineHours * 3_600_000), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ApplicationError('INVALID_STATE', 'Заявка уже отправляется.');
      await tx.auditLog.create({ data: { guildId: app.guildId, applicationId: id, actorId: userId, action: AuditAction.SUBMITTED, fromStatus: ApplicationStatus.DRAFT, toStatus: ApplicationStatus.NEW } });
      return tx.application.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async claim(id: string, moderatorId: string) {
    return this.db.$transaction(async (tx) => {
      const app = await tx.application.findUniqueOrThrow({ where: { id } });
      const changed = await tx.application.updateMany({ where: { id, version: app.version, OR: [{ assignedModeratorId: null }, { assignedModeratorId: moderatorId }], status: { in: [ApplicationStatus.NEW, ApplicationStatus.NEEDS_INFO, ApplicationStatus.ON_HOLD] } }, data: { assignedModeratorId: moderatorId, status: ApplicationStatus.IN_REVIEW, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ApplicationError('ALREADY_CLAIMED', 'Заявку уже взял другой модератор или её статус изменился.');
      await tx.auditLog.create({ data: { guildId: app.guildId, applicationId: id, actorId: moderatorId, action: AuditAction.ASSIGNED, fromStatus: app.status, toStatus: ApplicationStatus.IN_REVIEW } });
      return tx.application.findUniqueOrThrow({ where: { id } });
    });
  }

  async transition(id: string, actorId: string, toStatus: ApplicationStatus, reason?: string, cooldownDays = 14) {
    const requiredReason: ApplicationStatus[] = [ApplicationStatus.REJECTED, ApplicationStatus.NEEDS_INFO, ApplicationStatus.ON_HOLD];
    if (requiredReason.includes(toStatus) && !reason?.trim()) throw new ApplicationError('INCOMPLETE', 'Для этого решения обязательна причина.');
    return this.db.$transaction(async (tx) => {
      const app = await tx.application.findUnique({ where: { id } });
      if (!app) throw new ApplicationError('NOT_FOUND', 'Заявка не найдена.');
      const allowed: Record<ApplicationStatus, ApplicationStatus[]> = {
        DRAFT: [ApplicationStatus.CANCELLED], NEW: [ApplicationStatus.IN_REVIEW, ApplicationStatus.ON_HOLD],
        IN_REVIEW: [ApplicationStatus.NEEDS_INFO, ApplicationStatus.ON_HOLD, ApplicationStatus.APPROVED, ApplicationStatus.REJECTED],
        NEEDS_INFO: [ApplicationStatus.IN_REVIEW, ApplicationStatus.ON_HOLD, ApplicationStatus.REJECTED], ON_HOLD: [ApplicationStatus.IN_REVIEW, ApplicationStatus.REJECTED],
        APPROVED: [], REJECTED: [ApplicationStatus.APPEAL], APPEAL: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED], CANCELLED: [],
      };
      if (actorId === app.applicantId && ['APPROVED', 'REJECTED', 'NEEDS_INFO', 'ON_HOLD'].includes(toStatus)) throw new ApplicationError('INVALID_STATE', 'Нельзя принимать решение по собственной заявке.');
      if (toStatus === 'CANCELLED' && actorId !== app.applicantId) throw new ApplicationError('INVALID_STATE', 'Только автор может отменить черновик.');
      if (!allowed[app.status].includes(toStatus)) throw new ApplicationError('INVALID_STATE', `Переход ${app.status} → ${toStatus} запрещён.`);
      const terminal = toStatus === ApplicationStatus.APPROVED || toStatus === ApplicationStatus.REJECTED || toStatus === ApplicationStatus.CANCELLED;
      const cooldownUntil = toStatus === ApplicationStatus.REJECTED ? new Date(Date.now() + cooldownDays * 86_400_000) : app.cooldownUntil;
      const changed = await tx.application.updateMany({ where: { id, version: app.version }, data: { status: toStatus, reason, cooldownUntil, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ApplicationError('INVALID_STATE', 'Статус уже изменён другим модератором.');
      if (terminal) await tx.applicantState.update({ where: { guildId_userId: { guildId: app.guildId, userId: app.applicantId } }, data: { activeApplicationId: null, cooldownUntil } });
      await tx.auditLog.create({ data: { guildId: app.guildId, applicationId: id, actorId, action: toStatus === ApplicationStatus.NEEDS_INFO ? AuditAction.INFO_REQUESTED : AuditAction.STATUS_CHANGED, fromStatus: app.status, toStatus, reason } });
      return tx.application.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reassign(id: string, actorId: string, moderatorId: string, reason: string) {
    if (!reason.trim()) throw new ApplicationError('INCOMPLETE', 'Укажите причину переназначения.');
    return this.db.$transaction(async (tx) => {
      const app = await tx.application.findUniqueOrThrow({ where: { id } });
      if (['DRAFT', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(app.status) || moderatorId === app.applicantId) throw new ApplicationError('INVALID_STATE', 'Переназначение этой заявки недоступно.');
      const changed = await tx.application.updateMany({ where: { id, version: app.version }, data: { assignedModeratorId: moderatorId, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ApplicationError('INVALID_STATE', 'Заявка уже изменилась. Повторите действие.');
      await tx.auditLog.create({ data: { guildId: app.guildId, applicationId: id, actorId, action: AuditAction.REASSIGNED, reason, metadata: { moderatorId, previousModeratorId: app.assignedModeratorId } } });
      return tx.application.findUniqueOrThrow({ where: { id } });
    });
  }

  async appeal(id: string, actorId: string, reason: string) {
    return this.db.$transaction(async (tx) => {
      const app = await tx.application.findFirstOrThrow({ where: { id, applicantId: actorId, status: 'REJECTED' } });
      const cfg = await tx.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } });
      if (!cfg.appealsEnabled) throw new ApplicationError('INVALID_STATE', 'Апелляции выключены.');
      const previous = await tx.auditLog.count({ where: { applicationId: id, toStatus: 'APPEAL' } });
      if (previous) throw new ApplicationError('INVALID_STATE', 'Апелляция уже подавалась.');
      const reserved = await tx.applicantState.updateMany({ where: { guildId: app.guildId, userId: actorId, activeApplicationId: null }, data: { activeApplicationId: id } });
      if (reserved.count !== 1) throw new ApplicationError('ACTIVE_EXISTS', 'У вас уже есть активная заявка.');
      const updated = await tx.application.update({ where: { id }, data: { status: 'APPEAL', reason, version: { increment: 1 } } });
      await tx.auditLog.create({ data: { guildId: app.guildId, applicationId: id, actorId, action: 'STATUS_CHANGED', fromStatus: 'REJECTED', toStatus: 'APPEAL', reason } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
