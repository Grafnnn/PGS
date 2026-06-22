import { PrismaClient } from "@prisma/client";
import { createOrRotateStagingSmokeUser } from "../src/lib/smoke/user";

const prisma = new PrismaClient();

async function main() {
  const result = await createOrRotateStagingSmokeUser(prisma);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging smoke user setup failed.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
