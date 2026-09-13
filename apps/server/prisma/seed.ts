import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/lib/auth.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
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


  // A handful of agents so the admin table has something to page through.
  const agents = [
    ["+251986680094", "Marshal Yordanos", "Marshal Mobile Money", "Addis Ababa", "Bole", "ACTIVE", 24000, 1.5, "123789"],
    ["+251911223344", "Selam Bekele", "Selam Kiosk", "Addis Ababa", "Piassa", "ACTIVE", 8200, 1.25, "445120"],
    ["+251922334455", "Dawit Haile", "Dawit Trading", "Oromia", "Adama", "PENDING", 0, 1, null],
    ["+251933445566", "Hanna Girma", "Hanna Shop", "Amhara", "Bahir Dar", "ACTIVE", 15400, 1.75, "902314"],
    ["+251944556677", "Yonas Alemu", "Yonas Electronics", "Tigray", "Mekelle", "SUSPENDED", 300, 1, "771050"],
    ["+251955667788", "Meseret Tilahun", "Meseret Store", "Sidama", "Hawassa", "ACTIVE", 6100, 1.5, "318640"],
    ["+251966778899", "Kalkidan Abera", "Kal Mini Market", "Addis Ababa", "Megenagna", "PENDING", 0, 1.25, null],
    ["+251977889900", "Biruk Tesfaye", "Biruk Agent Post", "Oromia", "Jimma", "ACTIVE", 9800, 2, "560927"],
    ["+251988990011", "Rahel Mulugeta", "Rahel Boutique", "Amhara", "Gondar", "ACTIVE", 4300, 1.5, "204873"],
    ["+251799001122", "Samuel Negash", "Sami Agent", "Dire Dawa", "Dire Dawa", "SUSPENDED", 120, 1, "639401"],
    ["+251911002233", "Tigist Worku", "Tigist Cafe", "Addis Ababa", "CMC", "ACTIVE", 2750, 1.25, "487215"],
    ["+251922003344", "Nahom Fikru", "Nahom Stationery", "Oromia", "Bishoftu", "PENDING", 0, 1, null],
  ] as const;

  for (const [phone, fullName, businessName, region, city, status, balance, commissionRate, pin] of agents) {
    // Re-running the seed restores these demo rows to their listed state, so
    // +251986680094 goes back to ACTIVE with PIN 123789 after any poking about.
    await prisma.agent.upsert({
      where: { phone },
      update: { fullName, businessName, region, city, status, balance, commissionRate, pin },
      create: { phone, fullName, businessName, region, city, status, balance, commissionRate, pin },
    });
  }

  console.log(`Seeded ${agents.length} agents.`);

  // The bootstrap super admin. Its password is only reset when it is created,
  // so a changed password survives a re-seed.
  const superAdmin = await prisma.adminUser.upsert({
    where: { phone: "0000000000" },
    update: { role: "SUPER_ADMIN" },
    create: {
      phone: "0000000000",
      name: "Super Admin",
      role: "SUPER_ADMIN",
      passwordHash: hashPassword("12345678"),
    },
  });

  console.log(`Super admin ready: ${superAdmin.phone} / 12345678`);

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
