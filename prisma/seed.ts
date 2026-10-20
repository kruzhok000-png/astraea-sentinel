import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const guildId = process.env.GUILD_ID ?? '1389355523316519002';
const trusted = ['1388985537649578116', '794867229672996865', '1539394688539431043'];

async function main(): Promise<void> {
  await prisma.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.trustedAdmin.createMany({
    data: trusted.map((userId) => ({ guildId, userId })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${trusted.length} Application Admin identities for guild ${guildId}`);
}

main().finally(() => prisma.$disconnect());
