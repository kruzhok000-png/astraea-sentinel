import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { customId } from '../lib/custom-id.js';

const input = (id: string, label: string, style = TextInputStyle.Short, required = true, maxLength = 500) => new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength);
const row = (component: TextInputBuilder) => new ActionRowBuilder<TextInputBuilder>().addComponents(component);

export function profileModal(id: string) {
  return new ModalBuilder().setCustomId(customId('profile', id)).setTitle('✦ Игровой профиль').addComponents(
    row(input('gameNickname', 'Игровой ник', TextInputStyle.Short, true, 80)), row(input('projectServer', 'Проект / сервер', TextInputStyle.Short, true, 100)),
    row(input('timezone', 'Часовой пояс (например UTC+3)', TextInputStyle.Short, true, 30)), row(input('ageRange', 'Возраст: 13–17 / 18–24 / 25–34 / 35+', TextInputStyle.Short, true, 30)),
    row(input('previousExperience', 'Предыдущие гильдии / опыт', TextInputStyle.Paragraph, false, 700)),
  );
}
export function motivationModal(id: string) {
  return new ModalBuilder().setCustomId(customId('motivation', id)).setTitle('✧ Мотивация').addComponents(
    row(input('motivation', 'Почему именно CELESTIAL?', TextInputStyle.Paragraph, true, 900)), row(input('contribution', 'Чем вы будете полезны?', TextInputStyle.Paragraph, true, 900)),
    row(input('weeklyActivity', 'Активность за неделю', TextInputStyle.Short, true, 100)), row(input('profileUrl', 'Ссылка на профиль / скриншот', TextInputStyle.Short, false, 300)),
  );
}
export function contactModal(id: string) {
  return new ModalBuilder().setCustomId(customId('confirm', id)).setTitle('⟡ Подтверждение').addComponents(row(input('contact', 'Способ связи (необязательно)', TextInputStyle.Short, false, 200)));
}
export function reasonModal(action: 'ask' | 'reject' | 'hold', id: string) {
  const labels = { ask: 'Вопрос кандидату', reject: 'Причина отказа', hold: 'Причина паузы' };
  return new ModalBuilder().setCustomId(customId(action, id)).setTitle(labels[action]).addComponents(row(input('reason', labels[action], TextInputStyle.Paragraph, true, 900)));
}
export function replyModal(id: string) {
  return new ModalBuilder().setCustomId(customId('reply', id)).setTitle('Ответ на уточнение').addComponents(row(input('answer', 'Ваш ответ', TextInputStyle.Paragraph, true, 1200)));
}
export function appealModal(id: string) {
  return new ModalBuilder().setCustomId(customId('appeal', id)).setTitle('Апелляция CELESTIAL').addComponents(row(input('reason', 'Почему решение стоит пересмотреть?', TextInputStyle.Paragraph, true, 900)));
}

export function customizeModal(modal: ModalBuilder, values: Record<string, unknown>, labels: unknown): ModalBuilder {
  const json = modal.toJSON();
  for (const row of json.components) {
    if (!('components' in row)) continue;
    for (const component of row.components) {
      if (component.type !== 4) continue;
      const value = values[component.custom_id];
      if (typeof value === 'string' && value.length) component.value = value;
      if (labels && typeof labels === 'object' && !Array.isArray(labels)) {
        const label = (labels as Record<string, unknown>)[component.custom_id];
        if (typeof label === 'string' && label.trim()) component.label = label.slice(0, 45);
      }
    }
  }
  return ModalBuilder.from(json);
}
