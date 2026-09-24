import { db } from "../src/lib/db";
import crypto from "crypto";

function hashPassword(password: string): string {
  return "h" + crypto.createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("====================================");
  console.log(" MPLAD SENTINEL DATABASE SEED");
  console.log("====================================");

  console.log("\n[1/4] Creating demo users...");

  const users = [
    {
      email: "admin@mplad.gov.in",
      password: hashPassword("admin123"),
      name: "Admin Officer",
      role: "admin",
    },
    {
      email: "analyst@mplad.gov.in",
      password: hashPassword("analyst123"),
      name: "Senior Analyst",
      role: "analyst",
    },
    {
      email: "auditor@mplad.gov.in",
      password: hashPassword("auditor123"),
      name: "Field Auditor",
      role: "auditor",
    },
    {
      email: "citizen@citizen.in",
      password: hashPassword("citizen123"),
      name: "Citizen User",
      role: "citizen",
    },
  ];

  for (const user of users) {
    await db.user.upsert({
      where: {
        email: user.email,
      },
      update: {
        password: user.password,
        name: user.name,
        role: user.role,
      },
      create: user,
    });
  }

  console.log("✓ Demo users created");

  console.log("\n[2/4] Creating scoring configuration...");

  await db.scoringConfig.upsert({
    where: {
      id: "default",
    },
    update: {},
    create: {
      id: "default",
    },
  });

  console.log("✓ Scoring configuration created");

  console.log("\n[3/4] Checking database connection...");

  const userCount = await db.user.count();

  console.log(`✓ Database connected`);
  console.log(`✓ Users in database: ${userCount}`);

  console.log("\n[4/4] Seed completed");

  console.log("");
  console.log("====================================");
  console.log(" LOGIN ACCOUNTS");
  console.log("====================================");
  console.log("");
  console.log("Admin:");
  console.log("  Email: admin@mplad.gov.in");
  console.log("  Password: admin123");
  console.log("");
  console.log("Analyst:");
  console.log("  Email: analyst@mplad.gov.in");
  console.log("  Password: analyst123");
  console.log("");
  console.log("Auditor:");
  console.log("  Email: auditor@mplad.gov.in");
  console.log("  Password: auditor123");
  console.log("");
  console.log("Citizen:");
  console.log("  Email: citizen@citizen.in");
  console.log("  Password: citizen123");
  console.log("");
  console.log("====================================");
}

main()
  .catch((error) => {
    console.error("");
    console.error("SEED FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });