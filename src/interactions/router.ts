import type { Client, Interaction } from 'discord.js';
import { logger } from '../lib/logger.js';
import { handleCommand } from './commands.js';
import { handleButton, handleModal, handleSelect } from './components.js';
import { config } from '../config.js';

const lastAction = new Map<string, number>();

export async function routeInteraction(interaction: Interaction, client: Client): Promise<void> {
  try {
    if (interaction.guildId && interaction.guildId !== config.GUILD_ID) return;
    const now = Date.now();
    const previous = lastAction.get(interaction.user.id) ?? 0;
    if (now - previous < 900 && interaction.isRepliable()) {
      await interaction.reply({ content: 'Подождите секунду перед следующим действием.', ephemeral: true });
      return;
    }
    lastAction.set(interaction.user.id, now);
    if (lastAction.size > 10000) for (const [key, time] of lastAction) if (now - time > 60000) lastAction.delete(key);
    if (interaction.isChatInputCommand()) await handleCommand(interaction, client);
    else if (interaction.isButton()) await handleButton(interaction, client);
    else if (interaction.isStringSelectMenu()) await handleSelect(interaction);
    else if (interaction.isModalSubmit()) await handleModal(interaction, client);
  } catch (error) {
    logger.error({ err: error, interactionId: interaction.id, userId: interaction.user.id }, 'Unhandled interaction error');
    if (interaction.isRepliable() && interaction.deferred) await interaction.editReply({ content: '☾ Не удалось завершить действие. Проверьте настройки и текущий статус.' }).catch(() => undefined);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '☾ Произошла ошибка. Команда уведомлена.', ephemeral: true }).catch(() => undefined);
  }
}
