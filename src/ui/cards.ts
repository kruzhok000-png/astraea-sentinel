import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, userMention,
} from 'discord.js';
import type { Application, ApplicationStatus } from '@prisma/client';
import { customId } from '../lib/custom-id.js';
import { colors, statusLabel } from './theme.js';

const trim = (value: string | null | undefined, max = 220): string => value ? value.replace(/([*_~`|>])/g, '\\$1').slice(0, max) : '—';
const discordTime = (date: Date | null | undefined, style: 'R' | 'f' = 'f'): string => date ? `<t:${Math.floor(date.getTime() / 1000)}:${style}>` : '—';

function answerFields(app: Application) {
  return [
    { name: '01 · Игровой профиль', value: `Ник: ${trim(app.gameNickname, 100)}\nПроект: ${trim(app.projectServer, 120)}\nЧасовой пояс: ${trim(app.timezone, 40)} · Возраст: ${trim(app.ageRange, 40)}` },
    { name: 'Опыт и предыдущие гильдии', value: trim(app.previousExperience, 1000) },
    { name: '02 · Почему CELESTIAL', value: trim(app.motivation, 1000) },
    { name: 'Вклад в команду', value: trim(app.contribution, 1000) },
    { name: 'Активность', value: trim(app.weeklyActivity, 150) },
    { name: 'Профиль / скриншот', value: trim(app.profileUrl, 400) },
    { name: '03 · Подтверждения', value: `${app.acceptedRules ? '✓' : '✗'} Правила · ${app.confirmedHonesty ? '✓' : '✗'} Честность\nСвязь: ${trim(app.contact, 250)}` },
  ];
}

export function publicPanel(reviewDeadlineHours = 72) {
  const embed = new EmbedBuilder()
    .setColor(colors.indigo)
    .setTitle('✦ Вступление в CELESTIAL')
    .setDescription(`Мы ищем зрелых, активных и уважительных игроков. Расскажите о себе честно — Astraea проведёт вас через короткую анкету.\n\n⟡ Срок рассмотрения: **${reviewDeadlineHours} ч.**\n⟡ Возраст указывается диапазоном\n⟡ Лишние персональные данные не нужны`)
    .addFields({ name: 'Наши ценности', value: 'Команда • честная игра • взаимное уважение • развитие' })
    .setFooter({ text: 'CELESTIAL · среди звёзд важен каждый' });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('start')).setLabel('✦ Подать заявку').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('status')).setLabel('◈ Мой статус').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customId('rules')).setLabel('☾ Правила и вопросы').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export function draftCard(app: Application) {
  const embed = new EmbedBuilder().setColor(colors.violet).setTitle(`✧ Черновик досье №${String(app.number).padStart(4, '0')}`)
    .setDescription('Заполняйте разделы по порядку. Черновик можно сохранить и продолжить позже.')
    .addFields(
      { name: '1 · Игровой профиль', value: app.gameNickname ? `✓ ${trim(app.gameNickname, 80)}` : 'Не заполнено', inline: true },
      { name: '2 · Мотивация', value: app.motivation ? '✓ Заполнено' : 'Не заполнено', inline: true },
      { name: '3 · Подтверждение', value: app.acceptedRules && app.confirmedHonesty ? '✓ Принято' : 'Не заполнено', inline: true },
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('profile', app.id)).setLabel('1 · Профиль').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('motivation', app.id)).setLabel('2 · Мотивация').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('confirm', app.id)).setLabel('3 · Подтверждение').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('preview', app.id)).setLabel('Предпросмотр').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row], ephemeral: true as const };
}

export function previewCard(app: Application) {
  const complete = Boolean(app.gameNickname && app.projectServer && app.timezone && app.ageRange && app.motivation && app.contribution && app.weeklyActivity && app.acceptedRules && app.confirmedHonesty);
  const embed = new EmbedBuilder().setColor(complete ? colors.silver : colors.warning).setTitle(`⟡ Предпросмотр досье №${String(app.number).padStart(4, '0')}`)
    .addFields(...answerFields(app)).setFooter({ text: complete ? 'Проверьте ответы перед отправкой' : 'Заполните обязательные поля' });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('submit', app.id)).setLabel('✦ Отправить').setStyle(ButtonStyle.Success).setDisabled(!complete),
    new ButtonBuilder().setCustomId(customId('back', app.id)).setLabel('Назад').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customId('save', app.id)).setLabel('Сохранить черновик').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('cancel', app.id)).setLabel('Отменить').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: app.status === 'DRAFT' ? [row] : [], ephemeral: true as const };
}

export function dmStatusCard(app: Application, appealsEnabled = false) {
  const embed = new EmbedBuilder().setColor(statusColor(app.status)).setTitle(`◈ Досье CELESTIAL №${String(app.number).padStart(4, '0')}`)
    .setDescription(nextStep(app.status)).addFields(
      { name: 'Статус', value: `**${statusLabel[app.status]}**`, inline: true },
      { name: 'Ответственный', value: app.assignedModeratorId ? userMention(app.assignedModeratorId) : 'Ещё не назначен', inline: true },
      { name: 'Обновлено', value: discordTime(app.updatedAt, 'R'), inline: true },
    );
  if (app.status === 'REJECTED') embed.addFields({ name: 'Причина', value: trim(app.reason) }, { name: 'Повторная подача', value: discordTime(app.cooldownUntil) });
  if (app.status === 'NEEDS_INFO' || app.status === 'ON_HOLD') embed.addFields({ name: app.status === 'NEEDS_INFO' ? 'Вопрос команды' : 'Причина паузы', value: trim(app.reason, 1000) });
  const buttons = [new ButtonBuilder().setCustomId(customId('details', app.id)).setLabel('Открыть детали').setStyle(ButtonStyle.Secondary)];
  if (app.status === 'NEEDS_INFO') buttons.push(new ButtonBuilder().setCustomId(customId('reply', app.id)).setLabel('Ответить на уточнение').setStyle(ButtonStyle.Primary));
  if (app.status === 'APPROVED') buttons.push(new ButtonBuilder().setCustomId(customId('next', app.id)).setLabel('Что дальше?').setStyle(ButtonStyle.Success));
  if (app.status === 'REJECTED' && appealsEnabled) buttons.push(new ButtonBuilder().setCustomId(customId('appeal', app.id)).setLabel('Подать апелляцию').setStyle(ButtonStyle.Primary));
  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] };
}

export function moderationCard(app: Application, accountCreatedAt?: Date) {
  const embed = new EmbedBuilder().setColor(statusColor(app.status)).setTitle(`✦ Заявка №${String(app.number).padStart(4, '0')} · ${statusLabel[app.status]}`)
    .setDescription(`${userMention(app.applicantId)} · ID ${app.applicantId}\nАккаунт создан: ${discordTime(accountCreatedAt)}`)
    .addFields(
      ...answerFields(app),
      { name: 'Служебное', value: `Проверяющий: ${app.assignedModeratorId ? userMention(app.assignedModeratorId) : '—'}\nПодана: ${discordTime(app.submittedAt)} · дедлайн: ${discordTime(app.reviewDeadlineAt)}\nФлаги: ${app.suspicionFlags.join(', ') || 'нет'}` },
    ).setFooter({ text: 'Все решения записываются в аудит' });
  if (app.reason) embed.addFields({ name: 'Последний комментарий', value: trim(app.reason, 1000) });
  const first = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('claim', app.id)).setLabel('Взять на рассмотрение').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('ask', app.id)).setLabel('Запросить уточнение').setStyle(ButtonStyle.Secondary),
  );
  const decisions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('approve', app.id)).setLabel('Одобрить').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(customId('reject', app.id)).setLabel('Отклонить').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(customId('hold', app.id)).setLabel('Пауза').setStyle(ButtonStyle.Secondary),
  );
  const second = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('reassign', app.id)).setLabel('Переназначить').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customId('audit', app.id)).setLabel('Открыть аудит').setStyle(ButtonStyle.Secondary),
  );
  const terminal = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(app.status);
  if (terminal) {
    for (const row of [first, decisions]) for (const button of row.components) button.setDisabled(true);
  }
  return { embeds: [embed], components: [first, decisions, second] };
}

export function decisionCard(kind: 'approved' | 'rejected' | 'clarification', reason?: string) {
  const data = {
    approved: ['✦ Добро пожаловать в CELESTIAL', colors.success, 'Заявка одобрена. Роль участника уже ждёт вас на сервере. До встречи среди звёзд!'],
    rejected: ['☾ Решение по заявке', colors.danger, `Спасибо за интерес к CELESTIAL. Сейчас мы не готовы одобрить заявку.\n\n**Причина:** ${reason || 'указана в карточке статуса'}`],
    clarification: ['✧ Нужны уточнения', colors.warning, `Команда попросила дополнить заявку.\n\n**Вопрос:** ${reason || 'откройте карточку статуса'}`],
  } as const;
  return new EmbedBuilder().setTitle(data[kind][0]).setColor(data[kind][1]).setDescription(data[kind][2]).setFooter({ text: 'Astraea · CELESTIAL' });
}

function statusColor(status: ApplicationStatus): number {
  if (status === 'APPROVED') return colors.success;
  if (status === 'REJECTED') return colors.danger;
  if (status === 'NEEDS_INFO' || status === 'ON_HOLD') return colors.warning;
  return colors.indigo;
}

function nextStep(status: ApplicationStatus): string {
  const steps: Record<ApplicationStatus, string> = {
    DRAFT: 'Анкета сохранена. Вернитесь к публичной панели, чтобы продолжить.', NEW: 'Заявка в очереди. Команда скоро назначит проверяющего.',
    IN_REVIEW: 'Проверяющий изучает ответы. Следите за этой карточкой.', NEEDS_INFO: 'Нам нужен ваш ответ. Нажмите кнопку ниже.',
    ON_HOLD: 'Рассмотрение временно приостановлено. Причина указана ниже.', APPROVED: 'Добро пожаловать! Откройте следующий шаг.',
    REJECTED: 'Решение принято. Ниже указаны причина и дата повторной подачи.', APPEAL: 'Апелляция передана старшей команде.', CANCELLED: 'Черновик отменён.',
  };
  return steps[status];
}
