import { AuditAction, type Application, type GuildConfig } from '@prisma/client';
import { ChannelType, Client, EmbedBuilder, PermissionFlagsBits, type GuildMember, type TextChannel } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { decisionCard, dmStatusCard, moderationCard } from '../ui/cards.js';
import { colors } from '../ui/theme.js';
import { applyRolePlan, configuredRoleIds } from './role-policy.js';
import { serialized } from './serial.js';

export class DiscordDelivery {
  constructor(private readonly client: Client) {}

  async publishApplication(app: Application): Promise<Application> {
    return serialized(`publish:${app.id}`, async () => this.publishLatest(await prisma.application.findUniqueOrThrow({ where: { id: app.id } })));
  }

  private async publishLatest(app: Application): Promise<Application> {
    const guild = await this.client.guilds.fetch(app.guildId);
    const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } });
    if (!cfg.moderationChannelId) throw new Error('Не настроен moderationChannelId');
    const channel = await guild.channels.fetch(cfg.moderationChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Канал модерации недоступен');
    if (channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) throw new Error('Канал модерации должен быть скрыт от @everyone.');
    const member = await guild.members.fetch(app.applicantId).catch(() => null);
    const message = app.moderationMessageId ? await channel.messages.fetch(app.moderationMessageId) : await channel.send(await this.moderationPayload(app));
    await prisma.application.update({ where: { id: app.id }, data: { moderationChannelId: channel.id, moderationMessageId: message.id } });
    let threadId: string | undefined = app.threadId ?? undefined;
    if (!threadId && cfg.createPrivateThread && channel.type === ChannelType.GuildText) {
      const thread = await channel.threads.create({ name: `досье-${String(app.number).padStart(4, '0')}`, type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 10080, reason: `Application ${app.id}` });
      threadId = thread.id;
      const admins = await prisma.trustedAdmin.findMany({ where: { guildId: app.guildId } });
      for (const admin of admins) await thread.members.add(admin.userId).catch(() => undefined);
    }
    const updated = await prisma.application.update({ where: { id: app.id }, data: { moderationChannelId: channel.id, moderationMessageId: message.id, threadId } });
    await this.updateDmStatus(updated);
    await this.refreshModeration(updated);
    return updated;
  }

  async updateDmStatus(app: Application): Promise<boolean> {
    return serialized(`dm:${app.id}`, async () => this.updateLatestDm(await prisma.application.findUniqueOrThrow({ where: { id: app.id } })));
  }

  private async updateLatestDm(app: Application): Promise<boolean> {
    await prisma.application.update({ where: { id: app.id }, data: { lastDmAttemptAt: new Date() } });
    try {
      const user = await this.client.users.fetch(app.applicantId);
      const dm = await user.createDM();
      const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } });
      if (app.dmStatusMessageId) {
        const message = await dm.messages.fetch(app.dmStatusMessageId).catch((error: unknown) => {
          if (error && typeof error === 'object' && 'code' in error && error.code === 10008) return null;
          throw error;
        });
        if (message) {
          await message.edit(dmStatusCard(app, cfg.appealsEnabled));
          await prisma.application.update({ where: { id: app.id }, data: { dmSyncedVersion: app.version } });
          return true;
        }
      }
      const message = await dm.send(dmStatusCard(app, cfg.appealsEnabled));
      await prisma.application.update({ where: { id: app.id }, data: { dmChannelId: dm.id, dmStatusMessageId: message.id, dmSyncedVersion: app.version } });
      await prisma.auditLog.create({ data: { guildId: app.guildId, applicationId: app.id, actorId: this.client.user!.id, action: AuditAction.DM_SENT } });
      return true;
    } catch (error) {
      logger.warn({ err: error, applicationId: app.id }, 'Applicant DM unavailable');
      const warned = await prisma.auditLog.findFirst({ where: { applicationId: app.id, action: 'DM_FAILED', metadata: { path: ['version'], equals: app.version } } });
      if (warned) return false;
      await prisma.auditLog.create({ data: { guildId: app.guildId, applicationId: app.id, actorId: this.client.user!.id, action: AuditAction.DM_FAILED, reason: 'DM closed or unavailable', metadata: { version: app.version } } });
      await this.auditMessage(app.guildId, new EmbedBuilder().setColor(colors.warning).setTitle('☾ DM недоступны').setDescription(`Не удалось обновить карточку <@${app.applicantId}> по заявке №${app.number}.`));
      return false;
    }
  }

  async refreshModeration(app: Application): Promise<void> {
    return serialized(`moderation:${app.id}`, async () => this.refreshLatestModeration(await prisma.application.findUniqueOrThrow({ where: { id: app.id } })));
  }

  private async moderationPayload(app: Application) {
    const user = await this.client.users.fetch(app.applicantId);
    const card = moderationCard(app, user.createdAt);
    card.embeds[0]!.setThumbnail(user.displayAvatarURL());
    const events = await prisma.auditLog.findMany({ where: { applicationId: app.id, toStatus: { not: null } }, orderBy: { createdAt: 'desc' }, take: 3 });
    if (events.length) card.embeds[0]!.addFields({ name: 'Последние изменения', value: events.map((event) => `<t:${Math.floor(event.createdAt.getTime()/1000)}:R> · ${event.toStatus} · <@${event.actorId}>`).join('\n') });
    if (!app.dmStatusMessageId) card.embeds[0]!.addFields({ name: '☾ Личные сообщения', value: 'DM-карточка не доставлена. Кандидат может проверять статус на публичной панели.' });
    return card;
  }

  private async refreshLatestModeration(app: Application): Promise<void> {
    if (!app.moderationChannelId || !app.moderationMessageId) return;
    const channel = await this.client.channels.fetch(app.moderationChannelId).catch(() => null);
    if (channel?.isTextBased() && channel.type !== ChannelType.DM) {
      const message = await channel.messages.fetch(app.moderationMessageId).catch(() => null);
      if (message) await message.edit(await this.moderationPayload(app));
      if (message) await prisma.application.update({ where: { id: app.id }, data: { modSyncedVersion: app.version } });
    }
    if (app.threadId && app.assignedModeratorId) {
      const thread = await this.client.channels.fetch(app.threadId).catch(() => null);
      if (thread?.isThread()) await thread.members.add(app.assignedModeratorId);
    }
  }

  async grantConfiguredRoles(app: Application, actorId: string): Promise<string[]> {
    return serialized(`roles:${app.id}`, async () => {
      const granted = await prisma.auditLog.findFirst({ where: { applicationId: app.id, action: 'ROLE_GRANTED' } });
      if (granted) return [];
      return this.grantRoles(app, actorId);
    });
  }

  private async grantRoles(app: Application, actorId: string): Promise<string[]> {
    const guild = await this.client.guilds.fetch(app.guildId);
    const member = await guild.members.fetch(app.applicantId).catch(() => null);
    if (!member) throw new Error('Пользователь больше не состоит на сервере; роли не выданы.');
    const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } });
    const roleIds = configuredRoleIds(cfg);
    if (!cfg.memberRoleId) throw new Error('Роль Member не настроена.');
    for (const roleId of roleIds) {
      const role = await guild.roles.fetch(roleId);
      if (!role || role.managed || role.id === guild.id || !role.editable || role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Настроенная роль недоступна или имеет административные права.');
    }
    await applyRolePlan(member, roleIds, `Application #${app.number} approved by ${actorId}`);
    await prisma.auditLog.create({ data: { guildId: app.guildId, applicationId: app.id, actorId, action: AuditAction.ROLE_GRANTED, reason: app.reason ?? 'Одобрение заявки', metadata: { roleIds } } });
    await this.auditMessage(app.guildId, new EmbedBuilder().setColor(colors.success).setTitle('✦ Роли выданы').setDescription(`Досье №${app.number}\nКандидат: <@${app.applicantId}>\nМодератор: <@${actorId}>\nПричина: ${(app.reason ?? 'Одобрение заявки').slice(0, 900)}\nРоли: ${roleIds.map((id) => `<@&${id}>`).join(', ')}`)).catch((err) => logger.error({ err, applicationId: app.id }, 'Audit channel delivery failed; event persisted in database'));
    return roleIds;
  }

  async sendDecision(app: Application, kind: 'approved' | 'rejected' | 'clarification'): Promise<void> {
    return serialized(`notice:${app.id}`, async () => {
    const marker = `${kind}:${app.version}`;
    const existing = await prisma.auditLog.findFirst({ where: { applicationId: app.id, action: 'DM_SENT', metadata: { path: ['notice'], equals: marker } } });
    if (existing) return;
    const user = await this.client.users.fetch(app.applicantId);
    const template = await prisma.messageTemplate.findUnique({ where: { guildId_key: { guildId: app.guildId, key: kind } } });
    const card = decisionCard(kind, app.reason ?? undefined);
    if (template) card.setDescription(template.content);
    try {
      await user.send({ embeds: [card] });
      await prisma.auditLog.create({ data: { guildId: app.guildId, applicationId: app.id, actorId: this.client.user!.id, action: 'DM_SENT', metadata: { notice: marker } } });
    } catch (error) { logger.warn({ err: error, applicationId: app.id }, 'Decision DM failed'); }
    });
  }

  async auditMessage(guildId: string, embed: EmbedBuilder): Promise<void> {
    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!cfg?.auditChannelId) return;
    const channel = await this.client.channels.fetch(cfg.auditChannelId).catch(() => null) as TextChannel | null;
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  }
}

