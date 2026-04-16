import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (order matters for foreign keys)
  await prisma.notification.deleteMany();
  await prisma.queueEntry.deleteMany();
  await prisma.queue.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.service.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 12);

  // ─── USERS ───
  console.log("Creating Admin & Customers...");
  const admin = await prisma.user.create({
    data: {
      phone: "+2348011111111",
      firstName: "Admin",
      lastName: "User",
      passwordHash,
      role: "ADMIN",
      isVerified: true,
    },
  });

  const customer1 = await prisma.user.create({ data: { phone: "+2348033333333", firstName: "Adebayo", lastName: "Ogunlesi", passwordHash, role: "CUSTOMER", isVerified: true } });
  const customer2 = await prisma.user.create({ data: { phone: "+2348044444444", firstName: "Fatima", lastName: "Bello", passwordHash, role: "CUSTOMER", isVerified: true } });
  const customer3 = await prisma.user.create({ data: { phone: "+2348055555555", firstName: "Emeka", lastName: "Nwosu", passwordHash, role: "CUSTOMER", isVerified: true } });

  // ─── STAFF ACCOUNTS ───
  console.log("Creating Staff Accounts...");
  const staffAccounts = await Promise.all([
    prisma.user.create({ data: { phone: "+2348020000001", firstName: "Chioma", lastName: "Okafor", passwordHash, role: "STAFF", isVerified: true } }), // First Bank
    prisma.user.create({ data: { phone: "+2348020000002", firstName: "Dr. Hassan", lastName: "Musa", passwordHash, role: "STAFF", isVerified: true } }), // LUTH
    prisma.user.create({ data: { phone: "+2348020000003", firstName: "Officer", lastName: "Eze", passwordHash, role: "STAFF", isVerified: true } }), // NIS
    prisma.user.create({ data: { phone: "+2348020000004", firstName: "Toyin", lastName: "Adebayo", passwordHash, role: "STAFF", isVerified: true } }), // GTBank
    prisma.user.create({ data: { phone: "+2348020000005", firstName: "Tunde", lastName: "Bakare", passwordHash, role: "STAFF", isVerified: true } }), // Access Bank
    prisma.user.create({ data: { phone: "+2348020000006", firstName: "Ngozi", lastName: "Uba", passwordHash, role: "STAFF", isVerified: true } }), // NIMC
    prisma.user.create({ data: { phone: "+2348020000007", firstName: "Dr. Sarah", lastName: "John", passwordHash, role: "STAFF", isVerified: true } }), // Reddington
    prisma.user.create({ data: { phone: "+2348020000008", firstName: "Pharm.", lastName: "Kemi", passwordHash, role: "STAFF", isVerified: true } }), // LASUTH
  ]);

  // ─── INSTITUTIONS ───
  console.log("Creating Institutions...");
  const firstBank = await prisma.institution.create({
    data: {
      name: "First Bank Nigeria", slug: "first-bank-vi", type: "BANK",
      description: "First Bank of Nigeria, Victoria Island Branch",
      address: "1234 Adeola Odeku Street", city: "Lagos", state: "Lagos State",
      latitude: 6.4281, longitude: 3.4219, phone: "+2348001234567",
      operatingHours: { mon: { open: "08:00", close: "16:00" }, tue: { open: "08:00", close: "16:00" }, wed: { open: "08:00", close: "16:00" }, thu: { open: "08:00", close: "16:00" }, fri: { open: "08:00", close: "16:00" } },
    },
  });

  const luth = await prisma.institution.create({
    data: {
      name: "LUTH", slug: "luth-idi-araba", type: "HOSPITAL",
      description: "Lagos University Teaching Hospital Outpatient",
      address: "Idi-Araba, Surulere", city: "Lagos", state: "Lagos State",
      latitude: 6.51, longitude: 3.36, phone: "+2348007654321",
      operatingHours: { mon: { open: "07:00", close: "17:00" }, tue: { open: "07:00", close: "17:00" }, wed: { open: "07:00", close: "17:00" }, thu: { open: "07:00", close: "17:00" }, fri: { open: "07:00", close: "17:00" } },
    },
  });

  const nis = await prisma.institution.create({
    data: {
      name: "Nigeria Immigration Service", slug: "nis-ikoyi", type: "GOVERNMENT",
      description: "NIS Passport Office, Ikoyi",
      address: "15 Awolowo Road, Ikoyi", city: "Lagos", state: "Lagos State",
      latitude: 6.45, longitude: 3.43, phone: "+2348009876543",
      operatingHours: { mon: { open: "08:00", close: "15:00" }, tue: { open: "08:00", close: "15:00" }, wed: { open: "08:00", close: "15:00" }, thu: { open: "08:00", close: "15:00" }, fri: { open: "08:00", close: "15:00" } },
    },
  });

  const gtbank = await prisma.institution.create({
    data: {
      name: "Guaranty Trust Bank (GTB)", slug: "gtbank-ikeja", type: "BANK",
      description: "GTBank Computer Village Branch",
      address: "Obafemi Awolowo Way, Ikeja", city: "Ikeja", state: "Lagos State",
      latitude: 6.59, longitude: 3.33, phone: "+2348001112222",
      operatingHours: { mon: { open: "08:00", close: "16:00" }, tue: { open: "08:00", close: "16:00" }, wed: { open: "08:00", close: "16:00" }, thu: { open: "08:00", close: "16:00" }, fri: { open: "08:00", close: "16:00" } },
    },
  });

  const accessBank = await prisma.institution.create({
    data: {
      name: "Access Bank", slug: "access-lekki", type: "BANK",
      description: "Access Bank Admiralty Way Branch",
      address: "14 Admiralty Way, Lekki Phase 1", city: "Lekki", state: "Lagos State",
      latitude: 6.44, longitude: 3.47, phone: "+2348003334444",
      operatingHours: { mon: { open: "08:00", close: "16:00" }, tue: { open: "08:00", close: "16:00" }, wed: { open: "08:00", close: "16:00" }, thu: { open: "08:00", close: "16:00" }, fri: { open: "08:00", close: "16:00" } },
    },
  });

  const nimc = await prisma.institution.create({
    data: {
      name: "National Identity Management (NIN)", slug: "nimc-alausa", type: "GOVERNMENT",
      description: "NIMC State Headquarters",
      address: "Alausa Secretariat, Ikeja", city: "Ikeja", state: "Lagos State",
      latitude: 6.61, longitude: 3.35, phone: "+2348005556666",
      operatingHours: { mon: { open: "09:00", close: "15:00" }, tue: { open: "09:00", close: "15:00" }, wed: { open: "09:00", close: "15:00" }, thu: { open: "09:00", close: "15:00" }, fri: { open: "09:00", close: "15:00" } },
    },
  });

  const reddington = await prisma.institution.create({
    data: {
      name: "Reddington Hospital", slug: "reddington-vi", type: "HOSPITAL",
      description: "Reddington Multi-specialist Hospital",
      address: "12 Idowu Martins St, Victoria Island", city: "Lagos", state: "Lagos State",
      latitude: 6.43, longitude: 3.41, phone: "+2348007778888",
      operatingHours: { mon: { open: "00:00", close: "23:59" }, tue: { open: "00:00", close: "23:59" }, wed: { open: "00:00", close: "23:59" }, thu: { open: "00:00", close: "23:59" }, fri: { open: "00:00", close: "23:59" } },
    },
  });

  const lasuth = await prisma.institution.create({
    data: {
      name: "LASUTH", slug: "lasuth-ikeja", type: "HOSPITAL",
      description: "Lagos State University Teaching Hospital",
      address: "1-5 Oba Akinjobi Way, Ikeja", city: "Ikeja", state: "Lagos State",
      latitude: 6.58, longitude: 3.33, phone: "+2348009990000",
      operatingHours: { mon: { open: "07:00", close: "18:00" }, tue: { open: "07:00", close: "18:00" }, wed: { open: "07:00", close: "18:00" }, thu: { open: "07:00", close: "18:00" }, fri: { open: "07:00", close: "18:00" } },
    },
  });

  // ─── SERVICES ───
  console.log("Creating Services...");
  await prisma.service.createMany({
    data: [
      { name: "Cash Deposit / Withdrawal", description: "Teller services", estimatedTime: 6, institutionId: firstBank.id, sortOrder: 1 },
      { name: "Customer Service", description: "Account issues, ATM issues", estimatedTime: 15, institutionId: firstBank.id, sortOrder: 2 },
      { name: "Account Opening", description: "Open a new bank account", estimatedTime: 20, institutionId:  firstBank.id, sortOrder: 3 },
      { name: "Foreign Exchange", description: "Currency exchange services", estimatedTime: 10, institutionId:  firstBank.id, sortOrder: 4 },
      { name: "General Consultation", description: "See a GP", estimatedTime: 20, institutionId: luth.id, sortOrder: 1 },
      { name: "Pharmacy", description: "Collect drugs", estimatedTime: 5, institutionId: luth.id, sortOrder: 2 },
      { name: "Passport Application & Capture", description: "New passports", estimatedTime: 15, institutionId: nis.id, sortOrder: 1 },
      { name: "Passport Collection", description: "Pickup ready passports", estimatedTime: 5, institutionId: nis.id, sortOrder: 2 },
      { name: "Account Opening", description: "Open a new account", estimatedTime: 25, institutionId: gtbank.id, sortOrder: 1 },
      { name: "Cash Transactions", description: "Deposit/Withdrawals", estimatedTime: 5, institutionId: gtbank.id, sortOrder: 2 },
      { name: "Account Opening", description: "Open a new bank account", estimatedTime: 20, institutionId:  gtbank.id, sortOrder: 3 },
      { name: "Foreign Exchange", description: "Currency exchange services", estimatedTime: 10, institutionId:  gtbank.id, sortOrder: 4 },
      { name: "Card Collection", description: "Pickup new ATM cards", estimatedTime: 10, institutionId: gtbank.id, sortOrder: 5 },
      { name: "Card Collection", description: "Pickup new ATM cards", estimatedTime: 10, institutionId: accessBank.id, sortOrder: 1 },
      { name: "Account Opening", description: "Open a new bank account", estimatedTime: 20, institutionId:  accessBank.id, sortOrder: 3 },
      { name: "Foreign Exchange", description: "Currency exchange services", estimatedTime: 10, institutionId:  accessBank.id, sortOrder: 4 },
      { name: "NIN Registration", description: "New national identity registration", estimatedTime: 25, institutionId: nimc.id, sortOrder: 1 },
      { name: "Data Modification", description: "Change of name/DOB on NIN", estimatedTime: 40, institutionId: nimc.id, sortOrder: 2 },
      { name: "Specialist Consultation", description: "Cardiologist, Neurologist, etc.", estimatedTime: 30, institutionId: reddington.id, sortOrder: 1 },
      { name: "Diagnostics & Labs", description: "Blood work & Scans", estimatedTime: 15, institutionId: reddington.id, sortOrder: 2 },
      { name: "OPD Registration", description: "First time patients", estimatedTime: 10, institutionId: lasuth.id, sortOrder: 1 },
    ],
  });

  // ─── STAFF PROFILES ───
  console.log("Assigning Staff Profiles...");
  await prisma.staffProfile.createMany({
    data: [
      { userId: staffAccounts[0].id, institutionId: firstBank.id, counterNumber: 1, isOnDuty: true },
      { userId: staffAccounts[1].id, institutionId: luth.id, counterNumber: 3, isOnDuty: true },
      { userId: staffAccounts[2].id, institutionId: nis.id, counterNumber: 5, isOnDuty: true },
      { userId: staffAccounts[3].id, institutionId: gtbank.id, counterNumber: 2, isOnDuty: true },
      { userId: staffAccounts[4].id, institutionId: accessBank.id, counterNumber: 1, isOnDuty: true },
      { userId: staffAccounts[5].id, institutionId: nimc.id, counterNumber: 4, isOnDuty: true },
      { userId: staffAccounts[6].id, institutionId: reddington.id, counterNumber: 2, isOnDuty: true },
      { userId: staffAccounts[7].id, institutionId: lasuth.id, counterNumber: 6, isOnDuty: true },
    ]
  });

  console.log("✅ Extended seed data created successfully!");
  console.log("");
  console.log("Staff Accounts (password: password123):");
  console.log("  +2348020000001 (First Bank)");
  console.log("  +2348020000002 (LUTH)");
  console.log("  +2348020000003 (NIS)");
  console.log("  +2348020000004 (GTBank)");
  console.log("  +2348020000005 (Access Bank)");
  console.log("  +2348020000006 (NIMC)");
  console.log("  +2348020000007 (Reddington Hospital)");
  console.log("  +2348020000008 (LASUTH)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
