import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const expired = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const revokedRetentionDays = Number(process.env.REVOKED_SESSION_RETENTION_DAYS ?? 7);
  const revokedBefore = new Date(now.getTime() - revokedRetentionDays * 24 * 60 * 60 * 1000);
  const revoked = await prisma.session.deleteMany({ where: { revokedAt: { lt: revokedBefore } } });
  console.log(JSON.stringify({ ok: true, expiredDeleted: expired.count, revokedDeleted: revoked.count, revokedRetentionDays }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
