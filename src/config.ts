import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(20),
  CLIENT_ID: z.string().regex(/^\d+$/),
  GUILD_ID: z.string().regex(/^\d+$/).default('1389355523316519002'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const config = schema.parse(process.env);
export const TRUSTED_ADMIN_IDS = [
  '1388985537649578116',
  '794867229672996865',
  '1539394688539431043',
] as const;
