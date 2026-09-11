import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const abebe = await prisma.user.upsert({
    where: { phone: "+251911000001" },
    update: {},
    create: { phone: "+251911000001", name: "Abebe Kebede", balance: 5000 },
  });

  const lensa = await prisma.user.upsert({
    where: { phone: "+251911000002" },
    update: {},
    create: { phone: "+251911000002", name: "Lensa Tadesse", balance: 1200 },
  });

  await prisma.transaction.create({
    data: {
      amount: 250,
      status: "COMPLETED",
      reference: randomUUID(),
      note: "Seed transfer",
      senderId: abebe.id,
      receiverId: lensa.id,
    },
  });

  // Unclaimed deposit references for the deposit tab to look up.
  for (const [reference, amount] of [
    ["TB100001", 500],
    ["TB100002", 1000],
    ["TB100003", 2500],
  ] as const) {
    await prisma.deposit.upsert({
      where: { reference },
      update: {},
      create: { reference, amount },
    });
  }

  console.log("Seeded users:", abebe.name, lensa.name);
  console.log("Deposit references: TB100001 (500), TB100002 (1000), TB100003 (2500)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
