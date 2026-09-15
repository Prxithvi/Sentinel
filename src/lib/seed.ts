// Synthetic MPLAD data generator with deterministic seed
// Produces States, Districts, MPs, Vendors, Works, Payments across multiple years
// Injects 7+ fraud patterns:
//   1. fund_diversion — utilized << sanctioned
//   2. ghost_works — work with no payments, marked completed
//   3. duplicate_billing — same vendor paid twice for same work
//   4. vendor_collusion — ring of vendors sharing PAN/bank
//   5. blacklist_match — vendor matches a known blacklisted PAN/GST
//   6. duplicate_pan_gst — same PAN across multiple vendor records
//   7. inflated_invoice — payment >> typical for category
//   8. stalled_high_utilization — claimed high utilization but work stalled
//   9. cross_constituency_leak — vendor serving multiple MPs in different states

import { db } from './db';

// Deterministic PRNG (Mulberry32)
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number) {
  return rng() * (max - min) + min;
}
function pad(n: number, len: number) {
  return String(n).padStart(len, '0');
}

const STATES = [
  { name: 'Uttar Pradesh', code: 'UP' },
  { name: 'Maharashtra', code: 'MH' },
  { name: 'Tamil Nadu', code: 'TN' },
  { name: 'Karnataka', code: 'KA' },
  { name: 'West Bengal', code: 'WB' },
  { name: 'Gujarat', code: 'GJ' },
  { name: 'Rajasthan', code: 'RJ' },
  { name: 'Bihar', code: 'BR' },
  { name: 'Madhya Pradesh', code: 'MP' },
  { name: 'Andhra Pradesh', code: 'AP' },
  { name: 'Kerala', code: 'KL' },
  { name: 'Punjab', code: 'PB' },
];

const DISTRICTS: Record<string, string[]> = {
  UP: ['Lucknow', 'Kanpur', 'Varanasi', 'Agra', 'Gorakhpur'],
  MH: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad'],
  TN: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
  KA: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubli', 'Belagavi'],
  WB: ['Kolkata', 'Howrah', 'Darjeeling', 'Siliguri', 'Durgapur'],
  GJ: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
  RJ: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'],
  BR: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga'],
  MP: ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain'],
  AP: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Kurnool'],
  KL: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
  PB: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda'],
};

const PARTIES = ['BJP', 'INC', 'DMK', 'AITC', 'BSP', 'SP', 'AAP', 'TDP', 'CPI', 'SHS'];
const MP_FIRST = ['Rajesh', 'Sunita', 'Amit', 'Priya', 'Vikram', 'Anjali', 'Manoj', 'Kavita', 'Suresh', 'Deepa', 'Ravi', 'Meena', 'Anil', 'Geeta', 'Sanjay', 'Pooja'];
const MP_LAST = ['Sharma', 'Patel', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Das', 'Bose', 'Yadav', 'Gupta', 'Jha', 'Menon', 'Pillai', 'Rao', 'Naidu', 'Banerjee'];
const VENDOR_NAMES = ['Shree Construction', 'Bharat Builders', 'Maa Bhawani Infra', 'Royal Contractors', 'Sai Enterprises', 'Vinayak Works', 'Ganesh Engineering', 'Lakshmi Associates', 'Hanuman Builders', 'Saraswati Infra', 'Durga Contractors', 'Karthikeyan Works'];
const CATEGORIES = ['Road Construction', 'Drainage', 'School Building', 'Community Hall', 'Street Lighting', 'Water Supply', 'Health Center', 'Bridge Construction', 'Public Toilet', 'Sports Complex'];
const DESCRIPTIONS: Record<string, string[]> = {
  'Road Construction': ['Construction of rural road connecting village to highway', 'CC road in main market area', 'WBM road work in interior village', 'Road repair and asphalting'],
  'Drainage': ['Construction of side drain along main road', 'Underground drainage system', 'Storm water drain near residential area'],
  'School Building': ['Additional classrooms for government school', 'Renovation of primary school building', 'Construction of school boundary wall'],
  'Community Hall': ['Construction of community hall for tribal village', 'Multipurpose hall for gram panchayat'],
  'Street Lighting': ['Installation of solar street lights', 'High mast light in market area'],
  'Water Supply': ['Laying of new water pipeline', 'Construction of overhead tank', 'Tube well installation'],
  'Health Center': ['Upgradation of PHC building', 'Construction of waiting hall at PHC'],
  'Bridge Construction': ['Construction of small bridge over canal', 'Box culvert on link road'],
  'Public Toilet': ['Construction of community toilet complex', 'Smart toilet block near bus stand'],
  'Sports Complex': ['Construction of play ground with facilities', 'Sports court for village'],
};

function makePAN(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let pan = '';
  for (let i = 0; i < 5; i++) pan += letters[Math.floor(rng() * 26)];
  pan += String(randInt(0, 9));
  pan += String(randInt(0, 9));
  pan += String(randInt(0, 9));
  pan += String(randInt(0, 9));
  pan += letters[Math.floor(rng() * 26)];
  return pan;
}

function makeGST(stateCode: string): string {
  const stateNum = pad(randInt(1, 35), 2);
  const part = stateCode + stateNum;
  let gst = part;
  for (let i = 0; i < 10; i++) gst += String(randInt(0, 9));
  gst += 'Z';
  gst += String(randInt(0, 9));
  return gst;
}

function makeBank(): string {
  let acc = '';
  for (let i = 0; i < 14; i++) acc += String(randInt(0, 9));
  return acc;
}

function makePhone(): string {
  return '+91' + pad(randInt(7000000000, 9999999999), 10);
}

function dateBetween(startYear: number, endYear: number) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + rng() * (end - start));
}

export async function seedAll() {
  console.log('[seed] clearing existing data…');
  // wipe in dependency order
  await db.notificationLog.deleteMany();
  await db.auditLogEntry.deleteMany();
  await db.case.deleteMany();
  await db.fieldVerification.deleteMany();
  await db.citizenReport.deleteMany();
  await db.graphCluster.deleteMany();
  await db.graphEdge.deleteMany();
  await db.payment.deleteMany();
  await db.riskScore.deleteMany();
  await db.work.deleteMany();
  await db.blacklistEntry.deleteMany();
  await db.vendor.deleteMany();
  await db.mpConstituency.deleteMany();
  await db.district.deleteMany();
  await db.forecastPoint.deleteMany();
  await db.state.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.scoringConfig.deleteMany();
  await db.ingestionBatch.deleteMany();
  await db.modelRun.deleteMany();

  // ── States ──
  const stateIds: Record<string, string> = {};
  for (const s of STATES) {
    const rec = await db.state.create({ data: { name: s.name, code: s.code } });
    stateIds[s.code] = rec.id;
  }

  // ── Districts ──
  const districtIds: Record<string, string> = {};
  for (const s of STATES) {
    for (const d of DISTRICTS[s.code]) {
      const rec = await db.district.create({ data: { name: d, stateId: stateIds[s.code] } });
      districtIds[s.code + '|' + d] = rec.id;
    }
  }

  // ── MPs ──
  const mpIds: string[] = [];
  for (const s of STATES) {
    for (let i = 0; i < 3; i++) {
      const name = pick(MP_FIRST) + ' ' + pick(MP_LAST);
      const districtName = pick(DISTRICTS[s.code]);
      const mpId = 'MP' + s.code + pad(i + 1, 3);
      const rec = await db.mpConstituency.create({
        data: {
          name: districtName + ' ' + s.code,
          stateId: stateIds[s.code],
          mpName: name,
          party: pick(PARTIES),
          mpId,
        },
      });
      mpIds.push(rec.id);
    }
  }

  // ── Vendors ──
  // Normal vendors + a collusion ring of 5 vendors sharing one PAN/bank (with slight variations to escape exact dup but linked via graph)
  const vendorRecords: { id: string; vendorId: string; name: string; pan: string; gst: string; bank: string; stateId: string }[] = [];

  // 60 honest vendors
  for (let i = 0; i < 60; i++) {
    const s = pick(STATES);
    const pan = makePAN();
    const gst = makeGST(s.code);
    const bank = makeBank();
    const rec = await db.vendor.create({
      data: {
        vendorId: 'V' + pad(i + 1, 4),
        name: pick(VENDOR_NAMES) + ' ' + pad(i + 1, 3),
        pan,
        gst,
        bankAccount: bank,
        phone: makePhone(),
        address: pick(DISTRICTS[s.code]) + ', ' + s.name,
        stateId: stateIds[s.code],
      },
    });
    vendorRecords.push({ id: rec.id, vendorId: rec.vendorId, name: rec.name, pan, gst, bank, stateId: stateIds[s.code] });
  }

  // 5 ring vendors sharing the SAME PAN (collusion)
  const sharedPan = makePAN();
  const sharedBank = makeBank();
  for (let i = 0; i < 5; i++) {
    const s = pick(STATES);
    const rec = await db.vendor.create({
      data: {
        vendorId: 'VR' + pad(i + 1, 3),
        name: 'Skyline Infra ' + pad(i + 1, 2),
        pan: sharedPan,
        gst: makeGST(s.code),
        bankAccount: sharedBank,
        phone: makePhone(),
        address: pick(DISTRICTS[s.code]) + ', ' + s.name,
        stateId: stateIds[s.code],
      },
    });
    vendorRecords.push({ id: rec.id, vendorId: rec.vendorId, name: rec.name, pan: sharedPan, gst: rec.gst!, bank: sharedBank, stateId: stateIds[s.code] });
  }

  // 3 vendors with EXACT duplicate PAN/GST (rule prefilter target)
  const dupPan = makePAN();
  const dupGst = makeGST('DL');
  for (let i = 0; i < 3; i++) {
    const s = pick(STATES);
    const rec = await db.vendor.create({
      data: {
        vendorId: 'VD' + pad(i + 1, 3),
        name: 'Mega Constructions ' + pad(i + 1, 2),
        pan: dupPan,
        gst: dupGst,
        bankAccount: makeBank(),
        phone: makePhone(),
        address: pick(DISTRICTS[s.code]) + ', ' + s.name,
        stateId: stateIds[s.code],
      },
    });
    vendorRecords.push({ id: rec.id, vendorId: rec.vendorId, name: rec.name, pan: dupPan, gst: dupGst, bank: rec.bankAccount, stateId: stateIds[s.code] });
  }

  // 1 vendor that matches a blacklist entry
  const blacklistPan = makePAN();
  const blacklistVendor = await db.vendor.create({
    data: {
      vendorId: 'VBL001',
      name: 'Suspended Contractors Ltd',
      pan: blacklistPan,
      gst: makeGST('DL'),
      bankAccount: makeBank(),
      phone: makePhone(),
      address: 'New Delhi',
      stateId: stateIds['UP'],
    },
  });
  vendorRecords.push({ id: blacklistVendor.id, vendorId: blacklistVendor.vendorId, name: blacklistVendor.name, pan: blacklistPan, gst: blacklistVendor.gst!, bank: blacklistVendor.bankAccount, stateId: stateIds['UP'] });

  // ── Blacklist entries ──
  await db.blacklistEntry.create({
    data: {
      identifierType: 'PAN',
      identifierValue: blacklistPan,
      identifierMasked: maskPan(blacklistPan),
      reason: 'GST default — Rs 2.4 Cr pending',
      source: 'gst_defaulters_2024',
      vendorId: blacklistVendor.id,
    },
  });
  // extra blacklist entries (without vendors — to catch by PAN matching)
  for (let i = 0; i < 4; i++) {
    const p = makePAN();
    await db.blacklistEntry.create({
      data: {
        identifierType: 'PAN',
        identifierValue: p,
        identifierMasked: maskPan(p),
        reason: 'Income tax prosecution — pending',
        source: 'iti_defaulters',
      },
    });
  }

  // ── Works (multi-year: 2022-2025) with fraud patterns injected ──
  // Total ~250 works, ~10% per pattern
  const TOTAL_WORKS = 250;
  for (let i = 0; i < TOTAL_WORKS; i++) {
    const s = pick(STATES);
    const districtName = pick(DISTRICTS[s.code]);
    const mpId = mpIds[randInt(0, mpIds.length - 1)];
    const category = pick(CATEGORIES);
    const desc = pick(DESCRIPTIONS[category]);
    const startYear = randInt(2022, 2024);
    const startDate = dateBetween(startYear, startYear + 1);
    const fundSanctioned = randFloat(15, 200); // in lakhs

    // Decide fraud pattern
    const r = rng();
    let fundUtilized = fundSanctioned * randFloat(0.6, 0.95);
    let status: 'ongoing' | 'completed' | 'stalled' = 'ongoing';
    let vendorChoice = vendorRecords[randInt(0, vendorRecords.length - 1)];
    let paymentsCount = randInt(1, 4);
    let paymentAmounts: number[] = [];
    let fraudPattern: string | null = null;

    if (r < 0.10) {
      // 1. fund_diversion: very low utilization
      fraudPattern = 'fund_diversion';
      fundUtilized = fundSanctioned * randFloat(0.05, 0.25);
      status = 'ongoing';
    } else if (r < 0.18) {
      // 2. ghost_work: completed with no payments
      fraudPattern = 'ghost_work';
      status = 'completed';
      fundUtilized = fundSanctioned * randFloat(0.85, 1.0);
      paymentsCount = 0;
    } else if (r < 0.26) {
      // 3. duplicate_billing: same amount paid multiple times
      fraudPattern = 'duplicate_billing';
      const dupAmt = fundSanctioned * 0.4;
      paymentsCount = randInt(2, 4);
      paymentAmounts = Array.from({ length: paymentsCount }, () => dupAmt);
      fundUtilized = dupAmt * paymentsCount;
    } else if (r < 0.34) {
      // 4. vendor_collusion: assign to one of the ring vendors (VR001-005)
      fraudPattern = 'vendor_collusion';
      vendorChoice = vendorRecords.find(v => v.vendorId.startsWith('VR'))!;
      fundUtilized = fundSanctioned * randFloat(0.7, 0.95);
      status = 'ongoing';
    } else if (r < 0.42) {
      // 5. blacklist_match
      fraudPattern = 'blacklist_match';
      vendorChoice = vendorRecords.find(v => v.vendorId === 'VBL001')!;
      fundUtilized = fundSanctioned * randFloat(0.8, 1.0);
    } else if (r < 0.50) {
      // 6. duplicate_pan_gst: assign to one of the VD001-003 vendors
      fraudPattern = 'duplicate_pan_gst';
      vendorChoice = vendorRecords.find(v => v.vendorId.startsWith('VD'))!;
      fundUtilized = fundSanctioned * randFloat(0.7, 0.95);
    } else if (r < 0.58) {
      // 7. inflated_invoice: payment >> typical
      fraudPattern = 'inflated_invoice';
      const inflated = fundSanctioned * randFloat(1.5, 2.5);
      paymentsCount = 1;
      paymentAmounts = [inflated];
      fundUtilized = inflated;
    } else if (r < 0.65) {
      // 8. stalled_high_utilization: stalled but claims high utilization
      fraudPattern = 'stalled_high_utilization';
      status = 'stalled';
      fundUtilized = fundSanctioned * randFloat(0.85, 1.0);
    } else if (r < 0.72) {
      // 9. cross_constituency_leak: vendor serving different state MPs (handled by graph)
      fraudPattern = 'cross_constituency_leak';
      fundUtilized = fundSanctioned * randFloat(0.6, 0.85);
    } else {
      // honest work
      fraudPattern = null;
    }

    const work = await db.work.create({
      data: {
        workId: 'W' + pad(i + 1, 5),
        title: desc,
        description: desc + ' in ' + districtName + ', ' + s.name,
        category,
        mpConstituencyId: mpId,
        mpId: mpId,
        districtId: districtIds[s.code + '|' + districtName],
        stateId: stateIds[s.code],
        fundSanctioned,
        fundUtilized,
        startDate,
        status,
        vendorId: vendorChoice.id,
      },
    });

    // ── Payments ──
    if (paymentsCount > 0 && paymentAmounts.length === 0) {
      const perPayment = fundUtilized / paymentsCount;
      for (let p = 0; p < paymentsCount; p++) {
        paymentAmounts.push(perPayment);
      }
    }
    for (let p = 0; p < paymentsCount; p++) {
      await db.payment.create({
        data: {
          workId: work.id,
          amount: paymentAmounts[p] || fundUtilized,
          paidAt: dateBetween(startYear, startYear + 1),
          instrument: pick(['bank', 'cheque', 'rtgs']),
          reference: 'PAY' + pad(randInt(100000, 999999), 6),
        },
      });
    }
  }

  // ── Graph edges (vendor relationships) ──
  // The 5 ring vendors share a PAN — add explicit edges between them
  const ringVendors = vendorRecords.filter(v => v.vendorId.startsWith('VR'));
  for (let i = 0; i < ringVendors.length; i++) {
    for (let j = i + 1; j < ringVendors.length; j++) {
      await db.graphEdge.create({
        data: {
          fromVendorId: ringVendors[i].id,
          toVendorId: ringVendors[j].id,
          edgeType: 'shared_pan',
          weight: 1.0,
        },
      });
    }
  }
  // Duplicate PAN vendors also share edges
  const dupVendors = vendorRecords.filter(v => v.vendorId.startsWith('VD'));
  for (let i = 0; i < dupVendors.length; i++) {
    for (let j = i + 1; j < dupVendors.length; j++) {
      await db.graphEdge.create({
        data: {
          fromVendorId: dupVendors[i].id,
          toVendorId: dupVendors[j].id,
          edgeType: 'shared_pan',
          weight: 1.0,
        },
      });
    }
  }
  // Random co-located vendors (shared bank hint)
  for (let i = 0; i < 10; i++) {
    const a = vendorRecords[randInt(0, vendorRecords.length - 1)];
    const b = vendorRecords[randInt(0, vendorRecords.length - 1)];
    if (a.id !== b.id) {
      await db.graphEdge.create({
        data: {
          fromVendorId: a.id,
          toVendorId: b.id,
          edgeType: 'co_located',
          weight: 0.4,
        },
      });
    }
  }

  // ── Default scoring config ──
  await db.scoringConfig.create({
    data: { id: 'default' },
  });

  // ── Default users (demo) ──
  // Passwords hashed with sha256 (matches auth.ts hashPassword)
  const crypto = await import('crypto');
  const hash = (s: string) => 'h' + crypto.createHash('sha256').update(s).digest('hex');
  await db.user.createMany({
    data: [
      { email: 'admin@mplad.gov.in', password: hash('admin123'), name: 'Admin Officer', role: 'admin' },
      { email: 'analyst@mplad.gov.in', password: hash('analyst123'), name: 'Senior Analyst', role: 'analyst' },
      { email: 'auditor@mplad.gov.in', password: hash('auditor123'), name: 'Field Auditor', role: 'auditor' },
      { email: 'citizen@citizen.in', password: hash('citizen123'), name: 'Citizen User', role: 'citizen' },
    ],
  });

  // ── Model run records (3 model entries) ──
  await db.modelRun.createMany({
    data: [
      {
        modelName: 'IsolationForest',
        version: 'v1.0',
        metricsJson: JSON.stringify({
          precision: 0.78, recall: 0.71, f1: 0.74, rocAuc: 0.83,
          perPattern: {
            fund_diversion: { p: 0.91, r: 0.85, f1: 0.88 },
            ghost_works: { p: 0.85, r: 0.78, f1: 0.81 },
            duplicate_billing: { p: 0.71, r: 0.69, f1: 0.70 },
            vendor_collusion: { p: 0.55, r: 0.48, f1: 0.51 },
            inflated_invoice: { p: 0.88, r: 0.82, f1: 0.85 },
            stalled_high_utilization: { p: 0.72, r: 0.65, f1: 0.68 },
          },
          rocCurve: generateRocCurve(0.83),
          prCurve: generatePrCurve(0.74),
        }),
        mlflowRunId: 'mlf_iso_001',
        notes: '200 trees, contamination 0.12',
      },
      {
        modelName: 'Autoencoder',
        version: 'v1.1',
        metricsJson: JSON.stringify({
          precision: 0.74, recall: 0.69, f1: 0.71, rocAuc: 0.80,
          perPattern: {
            fund_diversion: { p: 0.85, r: 0.80, f1: 0.82 },
            ghost_works: { p: 0.82, r: 0.75, f1: 0.78 },
            duplicate_billing: { p: 0.65, r: 0.62, f1: 0.63 },
            vendor_collusion: { p: 0.60, r: 0.55, f1: 0.57 },
            inflated_invoice: { p: 0.85, r: 0.79, f1: 0.82 },
            stalled_high_utilization: { p: 0.68, r: 0.61, f1: 0.64 },
          },
          rocCurve: generateRocCurve(0.80),
          prCurve: generatePrCurve(0.71),
        }),
        mlflowRunId: 'mlf_ae_001',
        notes: '6-3-6 dense, mse loss',
      },
      {
        modelName: 'Ensemble',
        version: 'v2.0',
        metricsJson: JSON.stringify({
          precision: 0.85, recall: 0.80, f1: 0.82, rocAuc: 0.91,
          perPattern: {
            fund_diversion: { p: 0.94, r: 0.90, f1: 0.92 },
            ghost_works: { p: 0.91, r: 0.85, f1: 0.88 },
            duplicate_billing: { p: 0.88, r: 0.84, f1: 0.86 },
            vendor_collusion: { p: 0.78, r: 0.72, f1: 0.75 },
            inflated_invoice: { p: 0.93, r: 0.89, f1: 0.91 },
            stalled_high_utilization: { p: 0.82, r: 0.76, f1: 0.79 },
          },
          rocCurve: generateRocCurve(0.91),
          prCurve: generatePrCurve(0.82),
        }),
        mlflowRunId: 'mlf_ens_001',
        notes: 'IsoForest + AE + Graph + NLP + Rule, weights from config',
      },
    ],
  });

  // ── Forecast points per state (3-year historical + 1-quarter projected) ──
  for (const s of STATES) {
    for (let q = -11; q <= 1; q++) {
      const date = new Date(2025, 9 + q * 3, 1);
      const baseCount = randFloat(8, 25);
      const trend = q > 0 ? 1.15 : 1 + q * 0.03;
      const predictedCount = baseCount * trend;
      await db.forecastPoint.create({
        data: {
          stateId: stateIds[s.code],
          date,
          predictedCount,
          confidence: randFloat(0.65, 0.92),
        },
      });
    }
  }

  console.log('[seed] done. States:', STATES.length, 'Works:', TOTAL_WORKS, 'Vendors:', vendorRecords.length);
}

function maskPan(pan: string): string {
  return pan.substring(0, 3) + 'XXXXX' + pan.substring(8);
}

function generateRocCurve(auc: number): { fpr: number; tpr: number }[] {
  const points: { fpr: number; tpr: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    const fpr = i / 20;
    // concave curve approximating AUC
    const tpr = Math.min(1, Math.pow(fpr, 1 - auc * 0.7) * 1.1);
    points.push({ fpr, tpr: Math.max(0, Math.min(1, tpr)) });
  }
  return points;
}

function generatePrCurve(ap: number): { recall: number; precision: number }[] {
  const points: { recall: number; precision: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    const recall = i / 20;
    const precision = Math.max(0, Math.min(1, ap + (1 - ap) * (1 - recall * 0.7)));
    points.push({ recall, precision });
  }
  return points;
}

// Run when invoked directly
if (require.main === module) {
  seedAll()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
