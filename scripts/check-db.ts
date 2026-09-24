import { db } from "../src/lib/db";

async function main() {
  console.log("Users:", await db.user.count());
  console.log("States:", await db.state.count());
  console.log("Vendors:", await db.vendor.count());
  console.log("Works:", await db.work.count());
  console.log("Payments:", await db.payment.count());

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});