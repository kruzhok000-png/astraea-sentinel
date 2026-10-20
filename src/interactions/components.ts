import {
  ActionRowBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  type ButtonInteraction, type Client, type ModalSubmitInteraction, type StringSelectMenuInteraction,
} from 'discord.js';
import { ApplicationStatus, AuditAction } from '@prisma/client';
import { parseCustomId, customId } from '../lib/custom-id.js';
import { prisma } from '../lib/prisma.js';
import { ApplicationError, ApplicationService } from '../services/application-service.js';
import { DiscordDelivery } from '../services/discord-delivery.js';
import { draftCard, previewCard, dmStatusCard } from '../ui/cards.js';
import { colors } from '../ui/theme.js';
import { logger } from '../lib/logger.js';
import { ZodError } from 'zod';
import { replyPrivate, requirePermission } from './helpers.js';
import { appealModal, contactModal, customizeModal, motivationModal, profileModal, reasonModal, replyModal } from './modals.js';

const service = new ApplicationService(prisma);

export async function handleButton(interaction: ButtonInteraction, client: Client): Promise<void> {
  const parsed = parseCustomId(interaction.customId); if (!parsed) return;
  const { action, applicationId } = parsed;
  try {
    if (action === 'start') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!interaction.guildId) throw new Error('Откройте панель на сервере.');
      const app = await service.getOrCreateDraft(interaction.guildId, interaction.user.id);
      if (app.status !== ApplicationStatus.DRAFT) { await replyPrivate(interaction, { ...dmStatusCard(app), flags: MessageFlags.Ephemeral }); return; }
      await replyPrivate(interaction, draftCard(app)); return;
    }
    if (action === 'status') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!interaction.guildId) throw new Error('Статус доступен на сервере.');
      const app = await prisma.application.findFirst({ where: { guildId: interaction.guildId, applicantId: interaction.user.id }, orderBy: { createdAt: 'desc' } });
      const cfg = app ? await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } }) : null;
      await replyPrivate(interaction, app ? { ...dmStatusCard(app, cfg?.appealsEnabled ?? false), flags: MessageFlags.Ephemeral } : { content: 'У вас ещё нет заявок.', flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'rules') {
      await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(colors.navy).setTitle('☾ Правила и вопросы').setDescription('Будьте честны, уважайте участников и не передавайте лишние персональные данные. Возраст нужен только диапазоном. Если рассмотрение затянулось, используйте «Мой статус» — повторная заявка не ускорит процесс.')], flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'profile' || action === 'motivation') {
      const app = await ensureOwner(applicationId, interaction.user.id);
      if (app.status !== 'DRAFT') throw new ApplicationError('INVALID_STATE', 'Редактировать можно только черновик.');
      const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } });
      const modal = action === 'profile' ? profileModal(applicationId) : motivationModal(applicationId);
      await interaction.showModal(customizeModal(modal, app, cfg.questions)); return;
    }
    if (action === 'confirm') {
      await ensureOwner(applicationId, interaction.user.id);
      const menu = new StringSelectMenuBuilder().setCustomId(customId('confirm', applicationId)).setPlaceholder('Выберите подтверждение').setMinValues(1).setMaxValues(1)
        .addOptions(new StringSelectMenuOptionBuilder().setLabel('Согласен с правилами и подтверждаю честность').setValue('accept').setEmoji('⟡'));
      await replyPrivate(interaction, { content: 'Подтвердите оба обязательных пункта:', components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'preview' || action === 'back' || action === 'details') {
      const app = await ensureOwner(applicationId, interaction.user.id);
      const payload = action === 'back' ? draftCard(app) : previewCard(app);
      if (action === 'back') await interaction.update(payload); else await replyPrivate(interaction, { ...payload, flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'save') { await replyPrivate(interaction, { content: '✧ Черновик сохранён. Вернуться к нему можно через «Подать заявку».', flags: MessageFlags.Ephemeral }); return; }
    if (action === 'cancel') {
      const owned = await ensureOwner(applicationId, interaction.user.id);
      if (owned.status !== ApplicationStatus.DRAFT) throw new Error('Отменить можно только черновик.');
      await service.transition(applicationId, interaction.user.id, ApplicationStatus.CANCELLED);
      await interaction.update({ content: 'Черновик отменён.', embeds: [], components: [] }); return;
    }
    if (action === 'submit') {
      if (!interaction.guildId) throw new Error('Отправка возможна только на сервере.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: interaction.guildId } });
      const app = await service.submit(applicationId, interaction.user.id, cfg.reviewDeadlineHours);
      try {
        await new DiscordDelivery(client).publishApplication(app);
        const delivered = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
        await interaction.editReply({ content: `✦ Досье №${String(app.number).padStart(4, '0')} отправлено. ${delivered.dmStatusMessageId ? 'Карточка создана в личных сообщениях.' : 'Личные сообщения недоступны. Открывайте «Мой статус» на панели.'}` });
      } catch (err) {
        logger.error({ err, applicationId: app.id }, 'Initial delivery failed');
        await interaction.editReply({ content: `✦ Досье №${app.number} сохранено. Доставка команде задерживается и будет повторена автоматически. Повторно отправлять анкету не нужно.` });
      }
      return;
    }
    if (action === 'next') {
      await ensureOwner(applicationId, interaction.user.id);
      const granted = await prisma.auditLog.findFirst({ where: { applicationId, action: 'ROLE_GRANTED' } });
      await replyPrivate(interaction, { content: granted ? '✦ Роли выданы. Представьтесь команде и ознакомьтесь с каналами новичка.' : '✧ Заявка одобрена. Выдача ролей ожидает завершения; если вы покинули сервер, вернитесь в CELESTIAL.', flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'reply') { await ensureOwner(applicationId, interaction.user.id); await interaction.showModal(replyModal(applicationId)); return; }
    if (action === 'appeal') { await ensureOwner(applicationId, interaction.user.id); await interaction.showModal(appealModal(applicationId)); return; }
    if (action === 'claim') {
      if (!await requirePermission(interaction, 'CURATOR')) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const app = await service.claim(applicationId, interaction.user.id); await sync(app, client);
      await replyPrivate(interaction, { content: '✦ Заявка закреплена за вами.', flags: MessageFlags.Ephemeral }); return;
    }
    if (action === 'ask' || action === 'hold' || action === 'reject') {
      if (!await requirePermission(interaction, action === 'ask' ? 'CURATOR' : 'MODERATOR')) return;
      await interaction.showModal(reasonModal(action, applicationId)); return;
    }
    if (action === 'approve') {
      if (!await requirePermission(interaction, 'MODERATOR')) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const app = await service.transition(applicationId, interaction.user.id, ApplicationStatus.APPROVED, 'Анкета одобрена модератором.');
      const delivery = new DiscordDelivery(client);
      let roles: string[] = [];
      try { roles = await delivery.grantConfiguredRoles(app, interaction.user.id); }
      catch (error) {
        await prisma.auditLog.create({ data: { guildId: app.guildId, applicationId: app.id, actorId: interaction.user.id, action: AuditAction.ROLE_GRANT_FAILED, reason: error instanceof Error ? error.message : String(error) } });
        await sync(app, client); await interaction.editReply(`Заявка одобрена, но роль не выдана: ${error instanceof Error ? error.message : String(error)}`); return;
      }
      await sync(app, client); await delivery.sendDecision(app, 'approved');
      await delivery.auditMessage(app.guildId, new EmbedBuilder().setColor(colors.success).setTitle('✦ Заявка одобрена').setDescription(`Кандидат: <@${app.applicantId}>\nМодератор: <@${interaction.user.id}>\nРоли: ${roles.map((r) => `<@&${r}>`).join(', ') || 'не настроены'}`));
      await interaction.editReply('✦ Заявка одобрена, настроенные роли выданы.'); return;
    }
    if (action === 'reassign') { await replyPrivate(interaction, { content: 'Используйте `/application-reassign` — там можно безопасно выбрать нового проверяющего и указать причину.', flags: MessageFlags.Ephemeral }); return; }
    if (action === 'audit') {
      if (!await requirePermission(interaction, 'CURATOR')) return;
      const logs = await prisma.auditLog.findMany({ where: { applicationId }, orderBy: { createdAt: 'desc' }, take: 15 });
      const text = logs.map((l) => `<t:${Math.floor(l.createdAt.getTime()/1000)}:f> · **${l.action}** · <@${l.actorId}>${l.reason ? `\n${l.reason}` : ''}`).join('\n') || 'Записей нет.';
      await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(colors.silver).setTitle('◈ Аудит заявки').setDescription(text.slice(0, 4000))], flags: MessageFlags.Ephemeral }); return;
    }
  } catch (error) { await respondError(interaction, error); }
}

export async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId); if (!parsed || parsed.action !== 'confirm') return;
  try {
    const app = await ensureOwner(parsed.applicationId, interaction.user.id);
    if (interaction.values[0] !== 'accept') throw new Error('Подтверждение не выбрано.');
    const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: app.guildId } });
    await interaction.showModal(customizeModal(contactModal(parsed.applicationId), app, cfg.questions));
  }
  catch (error) { await respondError(interaction, error); }
}

export async function handleModal(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
  const parsed = parseCustomId(interaction.customId); if (!parsed) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (parsed.action === 'appeal') {
      const app = await ensureOwner(parsed.applicationId, interaction.user.id);
      const updated = await service.appeal(app.id, interaction.user.id, interaction.fields.getTextInputValue('reason'));
      await sync(updated, client);
      await replyPrivate(interaction, { content: '✧ Апелляция передана команде.', flags: MessageFlags.Ephemeral }); return;
    }
    if (parsed.action === 'profile') {
      const app = await service.updateProfile(parsed.applicationId, interaction.user.id, {
        gameNickname: interaction.fields.getTextInputValue('gameNickname'), projectServer: interaction.fields.getTextInputValue('projectServer'),
        timezone: interaction.fields.getTextInputValue('timezone'), ageRange: interaction.fields.getTextInputValue('ageRange'), previousExperience: interaction.fields.getTextInputValue('previousExperience') || undefined,
      }); await replyPrivate(interaction, draftCard(app)); return;
    }
    if (parsed.action === 'motivation') {
      const app = await service.updateMotivation(parsed.applicationId, interaction.user.id, {
        motivation: interaction.fields.getTextInputValue('motivation'), contribution: interaction.fields.getTextInputValue('contribution'),
        weeklyActivity: interaction.fields.getTextInputValue('weeklyActivity'), profileUrl: interaction.fields.getTextInputValue('profileUrl') || undefined,
      }); await replyPrivate(interaction, draftCard(app)); return;
    }
    if (parsed.action === 'confirm') {
      const app = await service.updateConfirmation(parsed.applicationId, interaction.user.id, { acceptedRules: true, confirmedHonesty: true, contact: interaction.fields.getTextInputValue('contact') || undefined });
      await replyPrivate(interaction, draftCard(app)); return;
    }
    if (parsed.action === 'reply') {
      const app = await ensureOwner(parsed.applicationId, interaction.user.id);
      if (app.status !== ApplicationStatus.NEEDS_INFO) throw new ApplicationError('INVALID_STATE', 'Уточнение уже не требуется.');
      const answer = interaction.fields.getTextInputValue('answer');
      const updated = await service.transition(app.id, interaction.user.id, ApplicationStatus.IN_REVIEW, answer);
      await prisma.auditLog.create({ data: { guildId: app.guildId, applicationId: app.id, actorId: interaction.user.id, action: AuditAction.INFO_RECEIVED, reason: answer } });
      await sync(updated, client); await replyPrivate(interaction, { content: '✧ Ответ передан модератору.', flags: MessageFlags.Ephemeral }); return;
    }
    if (parsed.action === 'ask' || parsed.action === 'hold' || parsed.action === 'reject') {
      const required = parsed.action === 'ask' ? 'CURATOR' : 'MODERATOR'; if (!await requirePermission(interaction, required)) return;
      const reason = interaction.fields.getTextInputValue('reason');
      const status = parsed.action === 'ask' ? ApplicationStatus.NEEDS_INFO : parsed.action === 'hold' ? ApplicationStatus.ON_HOLD : ApplicationStatus.REJECTED;
      const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId: interaction.guildId! } });
      const app = await service.transition(parsed.applicationId, interaction.user.id, status, reason, cfg.cooldownDays);
      await sync(app, client); const delivery = new DiscordDelivery(client);
      if (parsed.action !== 'hold') await delivery.sendDecision(app, parsed.action === 'ask' ? 'clarification' : 'rejected');
      await replyPrivate(interaction, { content: `Статус изменён: **${status}**.`, flags: MessageFlags.Ephemeral }); return;
    }
  } catch (error) { await respondError(interaction, error); }
}

async function ensureOwner(id: string, userId: string) {
  const app = await service.getOwned(id, userId); if (!app) throw new ApplicationError('NOT_FOUND', 'Заявка не найдена или принадлежит другому пользователю.'); return app;
}
async function sync(app: Awaited<ReturnType<ApplicationService['transition']>>, client: Client) { const delivery = new DiscordDelivery(client); await Promise.allSettled([delivery.updateDmStatus(app), delivery.refreshModeration(app)]); }
async function respondError(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, error: unknown) {
  logger.warn({ err: error, interactionId: interaction.id }, 'Interaction failed');
  const message = error instanceof ApplicationError ? error.message : error instanceof ZodError ? error.issues.map((issue) => issue.message).join('\n') : 'Не удалось завершить действие. Проверьте текущий статус и повторите попытку.';
  if (interaction.deferred) { await interaction.editReply({ content: `☾ ${message}` }); return; }
  if (interaction.replied) await interaction.followUp({ content: `☾ ${message}`, flags: MessageFlags.Ephemeral });
  else await replyPrivate(interaction, { content: `☾ ${message}`, flags: MessageFlags.Ephemeral });
}
