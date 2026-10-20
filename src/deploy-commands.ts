import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/definitions.js';
import { logger } from './lib/logger.js';

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), { body: commands });
logger.info({ count: commands.length, guildId: config.GUILD_ID }, 'Slash commands registered');
