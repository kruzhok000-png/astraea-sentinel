import { GuildMember, MessageFlags, type Interaction, type RepliableInteraction, type InteractionReplyOptions, type InteractionEditReplyOptions } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import { TRUSTED_ADMIN_IDS } from '../config.js';
import { hasPermission, highestPermission, type PermissionName } from '../services/permissions.js';

export async function requirePermission(interaction: Interaction, required: PermissionName): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guildId) return false;
  const cfg = await prisma.guildConfig.upsert({ where: { guildId: interaction.guildId }, create: { guildId: interaction.guildId }, update: {} });
  const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild?.members.fetch(interaction.user.id);
  const roles = member?.roles.cache.keys() ?? [];
  const trusted = new Set((await prisma.trustedAdmin.findMany({ where: { guildId: interaction.guildId } })).map((entry) => entry.userId));
  const permission = highestPermission(interaction.user.id, roles, cfg, trusted);
  if (hasPermission(permission, required)) return true;
  if (interaction.isRepliable()) {
    if (interaction.deferred) await interaction.editReply({ content: '⟡ Недостаточно прав внутри системы заявок.' });
    else await interaction.reply({ content: '⟡ Недостаточно прав внутри системы заявок.', flags: MessageFlags.Ephemeral });
  }
  return false;
}

export function csvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const text = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return `"${text.replaceAll('"', '""').replaceAll(/\r?\n/g, ' ')}"`;
}

export async function replyPrivate(interaction: RepliableInteraction, options: InteractionReplyOptions): Promise<void> {
  if (interaction.deferred) {
    const { flags, ephemeral, fetchReply, withResponse, ...payload } = options;
    await interaction.editReply(payload as InteractionEditReplyOptions);
  } else await interaction.reply(options);
}
