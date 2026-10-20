import { ChannelType, SlashCommandBuilder } from 'discord.js';
export const commands = [
  new SlashCommandBuilder().setName('application-panel').setDescription('Разместить или обновить панель заявок')
    .addChannelOption((o) => o.setName('channel').setDescription('Канал панели').addChannelTypes(ChannelType.GuildText).setRequired(false)),
  new SlashCommandBuilder().setName('application-config').setDescription('Настроить систему заявок')
    .addChannelOption((o) => o.setName('panel').setDescription('Публичная панель').addChannelTypes(ChannelType.GuildText))
    .addChannelOption((o) => o.setName('moderation').setDescription('Канал модерации').addChannelTypes(ChannelType.GuildText))
    .addChannelOption((o) => o.setName('audit').setDescription('Audit-log').addChannelTypes(ChannelType.GuildText))
    .addRoleOption((o) => o.setName('member_role').setDescription('Роль Member'))
    .addRoleOption((o) => o.setName('game_role').setDescription('Дополнительная игровая роль'))
    .addRoleOption((o) => o.setName('curator_role').setDescription('Роль Curator'))
    .addRoleOption((o) => o.setName('moderator_role').setDescription('Роль Moderator'))
    .addRoleOption((o) => o.setName('senior_role').setDescription('Роль Senior Moderator'))
    .addRoleOption((o) => o.setName('admin_role').setDescription('Роль Application Admin'))
    .addIntegerOption((o) => o.setName('cooldown_days').setDescription('Cooldown после отказа').setMinValue(1).setMaxValue(365))
    .addIntegerOption((o) => o.setName('deadline_hours').setDescription('Срок рассмотрения в часах').setMinValue(1).setMaxValue(720))
    .addUserOption((o) => o.setName('trusted_add').setDescription('Добавить доверенного Application Admin'))
    .addUserOption((o) => o.setName('trusted_remove').setDescription('Удалить доверенного Application Admin'))
    .addStringOption((o) => o.setName('question').setDescription('Вопрос для изменения подписи').addChoices(...['gameNickname','projectServer','timezone','previousExperience','motivation','contribution','weeklyActivity','profileUrl','contact'].map((value) => ({ name: value, value }))))
    .addStringOption((o) => o.setName('question_label').setDescription('Новая подпись выбранного вопроса (без лишних личных данных)').setMinLength(1).setMaxLength(45))
    .addBooleanOption((o) => o.setName('appeals').setDescription('Разрешить апелляции')),
  new SlashCommandBuilder().setName('application-stats').setDescription('Статистика заявок'),
  new SlashCommandBuilder().setName('application-search').setDescription('Найти заявку')
    .addUserOption((o) => o.setName('user').setDescription('Кандидат'))
    .addIntegerOption((o) => o.setName('number').setDescription('Номер досье').setMinValue(1)),
  new SlashCommandBuilder().setName('application-reassign').setDescription('Переназначить заявку')
    .addIntegerOption((o) => o.setName('number').setDescription('Номер').setRequired(true))
    .addUserOption((o) => o.setName('moderator').setDescription('Новый проверяющий').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина').setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName('application-ban').setDescription('Запретить подачу заявок')
    .addUserOption((o) => o.setName('user').setDescription('Пользователь').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина').setRequired(true).setMaxLength(500))
    .addIntegerOption((o) => o.setName('days').setDescription('Срок; пусто — бессрочно').setMinValue(1).setMaxValue(3650)),
  new SlashCommandBuilder().setName('application-template').setDescription('Изменить DM-шаблон')
    .addStringOption((o) => o.setName('key').setDescription('Ключ').setRequired(true).addChoices({ name: 'Одобрение', value: 'approved' }, { name: 'Отказ', value: 'rejected' }, { name: 'Уточнение', value: 'clarification' }))
    .addStringOption((o) => o.setName('content').setDescription('Текст').setRequired(true).setMaxLength(1800)),
  new SlashCommandBuilder().setName('application-export').setDescription('Экспорт CSV за период')
    .addIntegerOption((o) => o.setName('days').setDescription('Последние N дней').setMinValue(1).setMaxValue(365).setRequired(true)),
].map((command) => command.toJSON());
