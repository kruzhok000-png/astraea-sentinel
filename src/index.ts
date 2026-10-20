import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config, TRUSTED_ADMIN_IDS } from './config.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { routeInteraction } from './interactions/router.js';
import { startReconciliation } from './jobs/reconcile.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], allowedMentions: { parse: [], repliedUser: false } });
let stopWorker = async () => {};

client.once(Events.ClientReady, (ready) => {
  logger.info({ bot: ready.user.tag }, 'Discord client ready');
  logger.info({ guildId: config.GUILD_ID, trustedAdmins: TRUSTED_ADMIN_IDS.length }, 'Application system initialized');
  stopWorker = startReconciliation(client);
});
const inFlight = new Set<Promise<void>>();
client.on(Events.InteractionCreate, (interaction) => {
  if (shuttingDown) return;
  const task = routeInteraction(interaction, client);
  inFlight.add(task);
  void task.finally(() => inFlight.delete(task));
});
client.on(Events.Error, (error) => logger.error({ err: error }, 'Discord client error'));
process.on('unhandledRejection', (error) => { logger.fatal({ err: error }, 'Unhandled rejection'); void shutdown('unhandledRejection', 1); });
process.on('uncaughtException', (error) => { logger.fatal({ err: error }, 'Uncaught exception'); void shutdown('uncaughtException', 1); });

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return; shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  await Promise.allSettled([...inFlight, stopWorker()]);
  client.destroy();
  await prisma.$disconnect();
  logger.info('Shutdown complete');
  clearTimeout(deadline);
  process.exit(exitCode);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await prisma.$connect(); logger.info('PostgreSQL connected');
  await prisma.guildConfig.upsert({ where: { guildId: config.GUILD_ID }, create: { guildId: config.GUILD_ID }, update: {} });
  await prisma.trustedAdmin.createMany({ data: TRUSTED_ADMIN_IDS.map((userId) => ({ guildId: config.GUILD_ID, userId })), skipDuplicates: true });
  await client.login(config.DISCORD_TOKEN);
} catch (error) {
  logger.fatal({ err: error }, 'Startup failed'); await prisma.$disconnect(); process.exit(1);
}
