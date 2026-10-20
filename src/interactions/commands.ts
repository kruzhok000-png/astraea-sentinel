import { AttachmentBuilder, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction, type Client, type InteractionReplyOptions, type InteractionEditReplyOptions } from 'discord.js';
import { ApplicationStatus, AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { publicPanel, moderationCard } from '../ui/cards.js';
import { colors, statusLabel } from '../ui/theme.js';
import { requirePermission, csvCell } from './helpers.js';
import { ApplicationService } from '../services/application-service.js';
import { TRUSTED_ADMIN_IDS } from '../config.js';
import { highestPermission, hasPermission } from '../services/permissions.js';
import { DiscordDelivery } from '../services/discord-delivery.js';

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: 'Команда доступна только на сервере.', flags: MessageFlags.Ephemeral }); return; }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = (options: InteractionReplyOptions) => {
    const { flags, ephemeral, fetchReply, withResponse, ...payload } = options;
    return interaction.editReply(payload as InteractionEditReplyOptions);
  };
  const guildId = interaction.guildId;
  const service = new ApplicationService(prisma);

  switch (interaction.commandName) {
    case 'application-panel': {
      if (!await requirePermission(interaction, 'APPLICATION_ADMIN')) return;
      const cfg = await prisma.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
      const channelId = interaction.options.getChannel('channel')?.id ?? cfg.panelChannelId ?? interaction.channelId;
      const channel = await interaction.guild!.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) { await reply({ content: 'Укажите текстовый канал.', flags: MessageFlags.Ephemeral }); return; }
      let message = cfg.panelMessageId ? await channel.messages.fetch(cfg.panelMessageId).catch(() => null) : null;
      if (message) await message.edit(publicPanel(cfg.reviewDeadlineHours)); else message = await channel.send(publicPanel(cfg.reviewDeadlineHours));
      await prisma.guildConfig.update({ where: { guildId }, data: { panelChannelId: channel.id, panelMessageId: message.id } });
      await reply({ content: `✦ Панель ${cfg.panelMessageId ? 'обновлена' : 'размещена'} в <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
      return;
    }
    case 'application-config': {
      if (!await requirePermission(interaction, 'APPLICATION_ADMIN')) return;
      for (const key of ['member_role', 'game_role']) {
        const selected = interaction.options.getRole(key);
        if (selected) {
          const role = await interaction.guild!.roles.fetch(selected.id);
          if (!role || role.managed || role.id === guildId || !role.editable || role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Выберите обычную управляемую ботом роль без административных прав.');
        }
      }
      const add = interaction.options.getUser('trusted_add');
      const question = interaction.options.getString('question');
      const questionLabel = interaction.options.getString('question_label');
      if (Boolean(question) !== Boolean(questionLabel)) throw new Error('Укажите одновременно question и question_label.');
      const currentConfig = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId } });
      const questions = question && questionLabel ? { ...(currentConfig.questions && typeof currentConfig.questions === 'object' && !Array.isArray(currentConfig.questions) ? currentConfig.questions : {}), [question]: questionLabel } : undefined;
      const remove = interaction.options.getUser('trusted_remove');
      if (remove && (TRUSTED_ADMIN_IDS as readonly string[]).includes(remove.id)) throw new Error('Первоначальные доверенные лица защищены от удаления.');
      if (add) await prisma.trustedAdmin.upsert({ where: { guildId_userId: { guildId, userId: add.id } }, create: { guildId, userId: add.id }, update: {} });
      if (remove) await prisma.trustedAdmin.deleteMany({ where: { guildId, userId: remove.id } });
      const data = {
        questions,
        panelChannelId: interaction.options.getChannel('panel')?.id,
        moderationChannelId: interaction.options.getChannel('moderation')?.id,
        auditChannelId: interaction.options.getChannel('audit')?.id,
        memberRoleId: interaction.options.getRole('member_role')?.id,
        defaultGameRoleId: interaction.options.getRole('game_role')?.id,
        reviewDeadlineHours: interaction.options.getInteger('deadline_hours') ?? undefined,
        curatorRoleId: interaction.options.getRole('curator_role')?.id,
        moderatorRoleId: interaction.options.getRole('moderator_role')?.id,
        seniorModeratorRoleId: interaction.options.getRole('senior_role')?.id,
        applicationAdminRoleId: interaction.options.getRole('admin_role')?.id,
        cooldownDays: interaction.options.getInteger('cooldown_days') ?? undefined,
        appealsEnabled: interaction.options.getBoolean('appeals') ?? undefined,
      };
      const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      await prisma.guildConfig.upsert({ where: { guildId }, create: { guildId, ...clean }, update: clean });
      await prisma.auditLog.create({ data: { guildId, actorId: interaction.user.id, action: AuditAction.CONFIG_CHANGED, metadata: { ...clean, trustedAdded: add?.id ?? null, trustedRemoved: remove?.id ?? null } } });
      await reply({ content: `◈ Конфигурация обновлена (${Object.keys(clean).length} полей).`, flags: MessageFlags.Ephemeral }); return;
    }
    case 'application-stats': {
      if (!await requirePermission(interaction, 'SENIOR_MODERATOR')) return;
      const grouped = await prisma.application.groupBy({ by: ['status'], where: { guildId }, _count: true });
      const total = grouped.reduce((sum, row) => sum + row._count, 0);
      const lines = grouped.map((row) => `**${statusLabel[row.status]}:** ${row._count}`).join('\n') || 'Данных пока нет.';
      await reply({ embeds: [new EmbedBuilder().setColor(colors.indigo).setTitle('✧ Аналитика заявок').setDescription(`${lines}\n\n**Всего:** ${total}`)], flags: MessageFlags.Ephemeral }); return;
    }
    case 'application-search': {
      if (!await requirePermission(interaction, 'CURATOR')) return;
      const user = interaction.options.getUser('user'); const number = interaction.options.getInteger('number');
      if (!user && !number) { await reply({ content: 'Укажите пользователя или номер.', flags: MessageFlags.Ephemeral }); return; }
      const app = await prisma.application.findFirst({ where: { guildId, ...(user ? { applicantId: user.id } : {}), ...(number ? { number } : {}) }, orderBy: { createdAt: 'desc' } });
      if (!app) { await reply({ content: 'Заявка не найдена.', flags: MessageFlags.Ephemeral }); return; }
      await reply({ ...moderationCard(app), flags: MessageFlags.Ephemeral }); return;
    }
    case 'application-reassign': {
      if (!await requirePermission(interaction, 'SENIOR_MODERATOR')) return;
      const app = await prisma.application.findUnique({ where: { guildId_number: { guildId, number: interaction.options.getInteger('number', true) } } });
      if (!app) { await reply({ content: 'Заявка не найдена.', flags: MessageFlags.Ephemeral }); return; }
      const target = await interaction.guild!.members.fetch(interaction.options.getUser('moderator', true).id);
      const cfg = await prisma.guildConfig.findUniqueOrThrow({ where: { guildId } });
      const trusted = new Set((await prisma.trustedAdmin.findMany({ where: { guildId } })).map((admin) => admin.userId));
      if (!hasPermission(highestPermission(target.id, target.roles.cache.keys(), cfg, trusted), 'CURATOR')) { await reply({ content: 'У выбранного участника нет прав проверяющего.' }); return; }
      const updated = await service.reassign(app.id, interaction.user.id, target.id, interaction.options.getString('reason', true));
      const delivery = new DiscordDelivery(client);
      await delivery.refreshModeration(updated); await delivery.updateDmStatus(updated);
      await reply({ content: '✦ Проверяющий переназначен.', flags: MessageFlags.Ephemeral }); return;
    }
    case 'application-ban': {
      if (!await requirePermission(interaction, 'APPLICATION_ADMIN')) return;
      const user = interaction.options.getUser('user', true); const reason = interaction.options.getString('reason', true); const days = interaction.options.getInteger('days');
      const expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;
      await prisma.applicationBan.upsert({ where: { guildId_userId: { guildId, userId: user.id } }, create: { guildId, userId: user.id, reason, actorId: interaction.user.id, expiresAt }, update: { reason, actorId: interaction.user.id, expiresAt } });
      await prisma.auditLog.create({ data: { guildId, actorId: interaction.user.id, action: AuditAction.BANNED, reason, metadata: { userId: user.id, expiresAt: expiresAt?.toISOString() ?? null } } });
      await reply({ content: `☾ Для <@${user.id}> установлен запрет.`, flags: MessageFlags.Ephemeral }); return;
    }
    case 'application-template': {
      if (!await requirePermission(interaction, 'APPLICATION_ADMIN')) return;
      const key = interaction.options.getString('key', true); const content = interaction.options.getString('content', true);
      await prisma.messageTemplate.upsert({ where: { guildId_key: { guildId, key } }, create: { guildId, key, content, updatedBy: interaction.user.id }, update: { content, updatedBy: interaction.user.id } });
      await reply({ content: `✧ Шаблон «${key}» сохранён.`, flags: MessageFlags.Ephemeral }); return;
    }
    case 'application-export': {
      if (!await requirePermission(interaction, 'APPLICATION_ADMIN')) return;
      const days = interaction.options.getInteger('days', true); const since = new Date(Date.now() - days * 86_400_000);
      const apps = await prisma.application.findMany({ where: { guildId, createdAt: { gte: since } }, orderBy: { number: 'asc' }, take: 5001 });
      if (apps.length > 5000) { await reply({ content: 'В выборке больше 5000 заявок. Уменьшите период экспорта.' }); return; }
      const header = ['number','applicantId','status','gameNickname','projectServer','ageRange','assignedModeratorId','submittedAt','updatedAt'];
      const csv = '\uFEFF' + [header.join(','), ...apps.map((a) => header.map((key) => csvCell(a[key as keyof typeof a])).join(','))].join('\r\n');
      await prisma.auditLog.create({ data: { guildId, actorId: interaction.user.id, action: AuditAction.EXPORTED, metadata: { days, count: apps.length } } });
      await reply({ content: `Экспорт: ${apps.length} заявок.`, files: [new AttachmentBuilder(Buffer.from(csv), { name: `celestial-applications-${Date.now()}.csv` })], flags: MessageFlags.Ephemeral }); return;
    }
  }
}
