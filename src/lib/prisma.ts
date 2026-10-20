import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (event) => logger.error({ event }, 'Prisma error'));
prisma.$on('warn', (event) => logger.warn({ event }, 'Prisma warning'));
