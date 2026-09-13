const bcrypt = require('bcryptjs');

// Ensure HMAC_SECRET is populated before we compute demo seals, even if this
// module is imported ahead of the server bootstrap.
require('./bootstrapEnv').bootstrapEnv({ silent: true });
const { generateVerificationSeal, buildSealInput } = require('../services/cryptoSeal');

// Pre-computed bcrypt hashes
const adminHash = bcrypt.hashSync('Admin@123', 10);
const inspectorHash = bcrypt.hashSync('Inspector@123', 10);
const viewerHash = bcrypt.hashSync('Viewer@123', 10);

const users = [
  {
    id: 'usr-admin-01',
    name: 'Shri Rajesh Kumar',
    email: 'admin@nawi.gov.in',
    password: adminHash,
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'usr-officer-01',
    name: 'Shri Vikramaditya Sharma',
    email: 'inspector@nawi.gov.in',
    password: inspectorHash,
    role: 'INSPECTOR',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'usr-viewer-01',
    name: 'Smt. Ananya Sen',
    email: 'viewer@nawi.gov.in',
    password: viewerHash,
    role: 'VIEWER',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

const instruments = [
  {
    id: 'inst-wb-01',
    name: 'Khanna APMC Mandi Truck Weighbridge #1',
    type: 'WEIGHBRIDGE',
    manufacturer: 'Avery India Ltd',
    model: 'Weightronix E-1205',
    serialNumber: 'WB-2024-APMC-001',
    accuracyClass: 'CLASS_III',
    maxCapacity: 60000,
    minCapacity: 400,
    verificationInterval: 20,
    actualInterval: 20,
    unit: 'kg',
    location: 'Gate No. 2, Grain Market, Khanna, Punjab',
    isActive: true,
    createdAt: new Date('2026-01-15T09:30:00Z'),
    updatedAt: new Date('2026-01-15T09:30:00Z'),
  },
  {
    id: 'inst-es-01',
    name: 'Ludhiana Retail APMC Platform Scale',
    type: 'PLATFORM_SCALE',
    manufacturer: 'Essae-Teraoka Ltd',
    model: 'DS-215 High Precision',
    serialNumber: 'ES-2024-LDH-042',
    accuracyClass: 'CLASS_III',
    maxCapacity: 150,
    minCapacity: 1,
    verificationInterval: 0.05,
    actualInterval: 0.05,
    unit: 'kg',
    location: 'Shed 4, Subzi Mandi, Ludhiana, Punjab',
    isActive: true,
    createdAt: new Date('2026-02-01T10:15:00Z'),
    updatedAt: new Date('2026-02-01T10:15:00Z'),
  },
  {
    id: 'inst-lb-01',
    name: 'Metrology Lab Analytical Micro-Balance',
    type: 'LABORATORY_BALANCE',
    manufacturer: 'Mettler-Toledo',
    model: 'XPR205 Analytical',
    serialNumber: 'MT-2024-LAB-007',
    accuracyClass: 'CLASS_I',
    maxCapacity: 220,
    minCapacity: 0.01,
    verificationInterval: 0.001,
    actualInterval: 0.0001,
    unit: 'g',
    location: 'State Standards Metrology Laboratory, Chandigarh',
    isActive: true,
    createdAt: new Date('2026-02-10T14:00:00Z'),
    updatedAt: new Date('2026-02-10T14:00:00Z'),
  },
  {
    id: 'inst-ps-01',
    name: 'Jalandhar Food Grain Silo Heavy Platform Scale',
    type: 'PLATFORM_SCALE',
    manufacturer: 'CAS Corporation',
    model: 'DB-1H Industrial',
    serialNumber: 'CAS-2024-JAL-088',
    accuracyClass: 'CLASS_III',
    maxCapacity: 600,
    minCapacity: 4,
    verificationInterval: 0.2,
    actualInterval: 0.2,
    unit: 'kg',
    location: 'FCI Warehouse Complex, Jalandhar',
    isActive: true,
    createdAt: new Date('2026-02-15T11:20:00Z'),
    updatedAt: new Date('2026-02-15T11:20:00Z'),
  },
];

const testSessions = [
  {
    id: 'sess-01',
    certificateNo: 'NAWI-2026-000188',
    instrumentId: 'inst-wb-01',
    conductedById: 'usr-officer-01',
    status: 'COMPLETED',
    overallResult: 'PASS',
    temperature: 24.5,
    humidity: 55.0,
    remarks: 'Annual statutory reverification completed. All error bounds conform strictly to OIML R-76 Class III tolerances.',
    verificationSeal: null, // computed at load — see computeAndAssignSeals()
    sealedAt: new Date('2026-03-01T12:00:00Z'),
    startedAt: new Date('2026-03-01T10:00:00Z'),
    completedAt: new Date('2026-03-01T12:00:00Z'),
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T12:00:00Z'),
  },
  {
    id: 'sess-02',
    certificateNo: 'NAWI-2026-000245',
    instrumentId: 'inst-es-01',
    conductedById: 'usr-officer-01',
    status: 'COMPLETED',
    overallResult: 'PASS',
    temperature: 22.0,
    humidity: 50.0,
    remarks: 'Initial verification before market deployment. Scale approved for commercial transactions.',
    verificationSeal: null, // computed at load
    sealedAt: new Date('2026-03-05T14:30:00Z'),
    startedAt: new Date('2026-03-05T13:00:00Z'),
    completedAt: new Date('2026-03-05T14:30:00Z'),
    createdAt: new Date('2026-03-05T13:00:00Z'),
    updatedAt: new Date('2026-03-05T14:30:00Z'),
  },
  {
    id: 'sess-03',
    certificateNo: 'NAWI-2026-000312',
    instrumentId: 'inst-lb-01',
    conductedById: 'usr-officer-01',
    status: 'IN_PROGRESS',
    overallResult: null,
    temperature: 20.0,
    humidity: 45.0,
    remarks: 'Laboratory calibration session in progress.',
    verificationSeal: null,
    sealedAt: null,
    startedAt: new Date('2026-03-10T09:00:00Z'),
    completedAt: null,
    createdAt: new Date('2026-03-10T09:00:00Z'),
    updatedAt: new Date('2026-03-10T09:00:00Z'),
  },
  {
    id: 'sess-04',
    certificateNo: 'NAWI-2026-000401',
    instrumentId: 'inst-ps-01',
    conductedById: 'usr-officer-01',
    status: 'COMPLETED',
    overallResult: 'FAIL',
    temperature: 26.0,
    humidity: 58.0,
    remarks: 'Periodic reverification. Instrument REJECTED — indicated error at 600 kg (0.45 kg) exceeds the OIML R-76 Class III maximum permissible error of 0.30 kg. Trader directed to withdraw the scale from commercial use pending adjustment.',
    verificationSeal: null, // computed at load — a FAIL is still authentically sealed
    sealedAt: new Date('2026-03-14T16:20:00Z'),
    startedAt: new Date('2026-03-14T15:00:00Z'),
    completedAt: new Date('2026-03-14T16:20:00Z'),
    createdAt: new Date('2026-03-14T15:00:00Z'),
    updatedAt: new Date('2026-03-14T16:20:00Z'),
  },
];

const testResults = [
  {
    id: 'res-01',
    testSessionId: 'sess-01',
    testType: 'WEIGHING_PERFORMANCE',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      points: [
        { loadPoint: 'L1', appliedLoad: 0, indicatedInc: 0, errorInc: 0, indicatedDec: 0, errorDec: 0, mpe: 10, status: 'PASS' },
        { loadPoint: 'L2', appliedLoad: 400, indicatedInc: 400, errorInc: 0, indicatedDec: 400, errorDec: 0, mpe: 10, status: 'PASS' },
        { loadPoint: 'L3', appliedLoad: 6000, indicatedInc: 6005, errorInc: 5, indicatedDec: 6000, errorDec: 0, mpe: 10, status: 'PASS' },
        { loadPoint: 'L4', appliedLoad: 15000, indicatedInc: 15010, errorInc: 10, indicatedDec: 15005, errorDec: 5, mpe: 20, status: 'PASS' },
        { loadPoint: 'L5', appliedLoad: 30000, indicatedInc: 30015, errorInc: 15, indicatedDec: 30010, errorDec: 10, mpe: 30, status: 'PASS' },
        { loadPoint: 'L6', appliedLoad: 45000, indicatedInc: 45015, errorInc: 15, indicatedDec: 45010, errorDec: 10, mpe: 30, status: 'PASS' },
        { loadPoint: 'L7', appliedLoad: 60000, indicatedInc: 60020, errorInc: 20, indicatedDec: 60015, errorDec: 15, mpe: 30, status: 'PASS' },
      ],
    },
    calculations: { maxCorrectedError: 20, maxMpeAllowed: 30, overallVerdict: 'PASS' },
    remarks: 'Weighing performance test passed within MPE bounds.',
    createdAt: new Date('2026-03-01T10:30:00Z'),
    updatedAt: new Date('2026-03-01T10:30:00Z'),
  },
  {
    id: 'res-02',
    testSessionId: 'sess-01',
    testType: 'REPEATABILITY',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      series: [
        { run: 1, load: 30000, indicated: 30005, error: 5 },
        { run: 2, load: 30000, indicated: 30005, error: 5 },
        { run: 3, load: 30000, indicated: 30010, error: 10 },
      ],
    },
    calculations: { maxDifference: 5, allowableMpe: 20, overallVerdict: 'PASS' },
    remarks: 'Repeatability verified at 50% capacity.',
    createdAt: new Date('2026-03-01T11:00:00Z'),
    updatedAt: new Date('2026-03-01T11:00:00Z'),
  },
  {
    id: 'res-03',
    testSessionId: 'sess-01',
    testType: 'ECCENTRICITY',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      positions: [
        { position: 'Center', load: 20000, indicated: 20000, error: 0, mpe: 20, status: 'PASS' },
        { position: 'Front-Left', load: 20000, indicated: 20005, error: 5, mpe: 20, status: 'PASS' },
        { position: 'Front-Right', load: 20000, indicated: 20005, error: 5, mpe: 20, status: 'PASS' },
        { position: 'Back-Left', load: 20000, indicated: 20000, error: 0, mpe: 20, status: 'PASS' },
        { position: 'Back-Right', load: 20000, indicated: 20005, error: 5, mpe: 20, status: 'PASS' },
      ],
    },
    calculations: { maxError: 5, mpeAllowed: 20, overallVerdict: 'PASS' },
    remarks: 'Eccentricity test over all 4 quadrant load cells passed.',
    createdAt: new Date('2026-03-01T11:30:00Z'),
    updatedAt: new Date('2026-03-01T11:30:00Z'),
  },
  {
    id: 'res-04',
    testSessionId: 'sess-02',
    testType: 'WEIGHING_PERFORMANCE',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      points: [
        { loadPoint: 'L1', appliedLoad: 0, indicatedInc: 0, errorInc: 0, indicatedDec: 0, errorDec: 0, error: 0, mpe: 0.025, status: 'PASS' },
        { loadPoint: 'L2', appliedLoad: 5, indicatedInc: 5.0, errorInc: 0, indicatedDec: 5.0, errorDec: 0, error: 0, mpe: 0.025, status: 'PASS' },
        { loadPoint: 'L3', appliedLoad: 25, indicatedInc: 25.0, errorInc: 0, indicatedDec: 25.0, errorDec: 0, error: 0, mpe: 0.025, status: 'PASS' },
        { loadPoint: 'L4', appliedLoad: 50, indicatedInc: 50.02, errorInc: 0.02, indicatedDec: 50.02, errorDec: 0.02, error: 0.02, mpe: 0.05, status: 'PASS' },
        { loadPoint: 'L5', appliedLoad: 100, indicatedInc: 100.03, errorInc: 0.03, indicatedDec: 100.02, errorDec: 0.02, error: 0.03, mpe: 0.05, status: 'PASS' },
        { loadPoint: 'L6', appliedLoad: 150, indicatedInc: 150.05, errorInc: 0.05, indicatedDec: 150.04, errorDec: 0.04, error: 0.05, mpe: 0.075, status: 'PASS' },
      ],
    },
    calculations: { maxCorrectedError: 0.05, maxMpeAllowed: 0.075, overallVerdict: 'PASS' },
    remarks: 'Weighing performance across the full span conforms to Class III tolerances.',
    createdAt: new Date('2026-03-05T13:30:00Z'),
    updatedAt: new Date('2026-03-05T13:30:00Z'),
  },
  {
    id: 'res-05',
    testSessionId: 'sess-02',
    testType: 'REPEATABILITY',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      series: [
        { run: 1, load: 75, indicated: 75.02, error: 0.02 },
        { run: 2, load: 75, indicated: 75.02, error: 0.02 },
        { run: 3, load: 75, indicated: 75.03, error: 0.03 },
      ],
    },
    calculations: { maxDifference: 0.01, allowableMpe: 0.05, overallVerdict: 'PASS' },
    remarks: 'Repeatability at 50% of maximum capacity within tolerance.',
    createdAt: new Date('2026-03-05T14:00:00Z'),
    updatedAt: new Date('2026-03-05T14:00:00Z'),
  },
  {
    id: 'res-06',
    testSessionId: 'sess-02',
    testType: 'ECCENTRICITY',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      positions: [
        { position: 'Center', load: 50, indicated: 50.0, error: 0, mpe: 0.05, status: 'PASS' },
        { position: 'Front-Left', load: 50, indicated: 50.02, error: 0.02, mpe: 0.05, status: 'PASS' },
        { position: 'Front-Right', load: 50, indicated: 50.02, error: 0.02, mpe: 0.05, status: 'PASS' },
        { position: 'Back-Left', load: 50, indicated: 50.01, error: 0.01, mpe: 0.05, status: 'PASS' },
        { position: 'Back-Right', load: 50, indicated: 50.02, error: 0.02, mpe: 0.05, status: 'PASS' },
      ],
    },
    calculations: { maxError: 0.02, mpeAllowed: 0.05, overallVerdict: 'PASS' },
    remarks: 'Off-centre loading test passed at all four quadrants.',
    createdAt: new Date('2026-03-05T14:15:00Z'),
    updatedAt: new Date('2026-03-05T14:15:00Z'),
  },
  // ---- sess-04: deliberate MPE breach, demonstrating the rejection path ----
  {
    id: 'res-07',
    testSessionId: 'sess-04',
    testType: 'WEIGHING_PERFORMANCE',
    status: 'COMPLETED',
    result: 'FAIL',
    data: {
      points: [
        { loadPoint: 'L1', appliedLoad: 0, indicatedInc: 0, errorInc: 0, indicatedDec: 0, errorDec: 0, error: 0, mpe: 0.1, status: 'PASS' },
        { loadPoint: 'L2', appliedLoad: 60, indicatedInc: 60.0, errorInc: 0, indicatedDec: 60.0, errorDec: 0, error: 0, mpe: 0.1, status: 'PASS' },
        { loadPoint: 'L3', appliedLoad: 100, indicatedInc: 100.05, errorInc: 0.05, indicatedDec: 100.05, errorDec: 0.05, error: 0.05, mpe: 0.1, status: 'PASS' },
        { loadPoint: 'L4', appliedLoad: 200, indicatedInc: 200.15, errorInc: 0.15, indicatedDec: 200.15, errorDec: 0.15, error: 0.15, mpe: 0.2, status: 'PASS' },
        { loadPoint: 'L5', appliedLoad: 400, indicatedInc: 400.35, errorInc: 0.35, indicatedDec: 400.3, errorDec: 0.3, error: 0.35, mpe: 0.2, status: 'FAIL' },
        { loadPoint: 'L6', appliedLoad: 600, indicatedInc: 600.45, errorInc: 0.45, indicatedDec: 600.4, errorDec: 0.4, error: 0.45, mpe: 0.3, status: 'FAIL' },
      ],
    },
    calculations: { maxCorrectedError: 0.45, maxMpeAllowed: 0.3, overallVerdict: 'FAIL' },
    remarks: 'Progressive positive span error. Error exceeds MPE from 2000 e upward — the instrument over-reads at high load, systematically overcharging traders.',
    createdAt: new Date('2026-03-14T15:30:00Z'),
    updatedAt: new Date('2026-03-14T15:30:00Z'),
  },
  {
    id: 'res-08',
    testSessionId: 'sess-04',
    testType: 'ECCENTRICITY',
    status: 'COMPLETED',
    result: 'PASS',
    data: {
      positions: [
        { position: 'Center', load: 200, indicated: 200.15, error: 0.15, mpe: 0.2, status: 'PASS' },
        { position: 'Front-Left', load: 200, indicated: 200.18, error: 0.18, mpe: 0.2, status: 'PASS' },
        { position: 'Front-Right', load: 200, indicated: 200.17, error: 0.17, mpe: 0.2, status: 'PASS' },
        { position: 'Back-Left', load: 200, indicated: 200.16, error: 0.16, mpe: 0.2, status: 'PASS' },
        { position: 'Back-Right', load: 200, indicated: 200.18, error: 0.18, mpe: 0.2, status: 'PASS' },
      ],
    },
    calculations: { maxError: 0.18, mpeAllowed: 0.2, overallVerdict: 'PASS' },
    remarks: 'Eccentricity acceptable — the defect is a span/linearity fault, not a load-cell imbalance.',
    createdAt: new Date('2026-03-14T16:00:00Z'),
    updatedAt: new Date('2026-03-14T16:00:00Z'),
  },
  // ---- sess-03: partially entered, left for an evaluator to finish ----
  {
    id: 'res-09',
    testSessionId: 'sess-03',
    testType: 'REPEATABILITY',
    status: 'IN_PROGRESS',
    result: null,
    data: {
      series: [
        { run: 1, load: 100, indicated: 100.0002, error: 0.0002 },
        { run: 2, load: 100, indicated: 100.0003, error: 0.0003 },
      ],
    },
    calculations: null,
    remarks: 'Two of three runs recorded; third run pending.',
    createdAt: new Date('2026-03-10T09:30:00Z'),
    updatedAt: new Date('2026-03-10T09:30:00Z'),
  },
];

/**
 * Compute an authentic HMAC-SHA256 verification seal for every sealed demo session.
 *
 * These used to be hardcoded placeholder hex strings (one was literally the SHA-256
 * of the empty string), so the public verification endpoint recomputed the canonical
 * HMAC, found a mismatch, and reported the portal's own flagship demo certificate as
 * status "TAMPERED" / valid:false — the worst possible outcome for a project whose
 * entire pitch is evidentiary trust.
 *
 * The payload shape below MUST stay identical to the one assembled in
 * `reports.controller.js -> verifyCertificate`, or verification breaks again.
 */
function computeAndAssignSeals() {
  for (const session of testSessions) {
    // Seal every terminal (finalized) session — both a PASS (COMPLETED) and a
    // FAIL (FAILED) are authentically sealed legal records (audit B-P2-2).
    if (session.status !== 'COMPLETED' && session.status !== 'FAILED') continue;

    const inst = instruments.find((i) => i.id === session.instrumentId);
    if (!inst) continue;

    // Built via the shared canonical helper so the seal is byte-identical to the
    // one produced by finalize and recomputed by verifyCertificate, and keyed to
    // the immutable officer id rather than the display name (audit B-P0-2).
    session.verificationSeal = generateVerificationSeal(
      buildSealInput({ ...session, instrument: inst })
    );
  }
}

const auditLogs = [
  {
    id: 'aud-01',
    userId: 'usr-admin-01',
    action: 'INITIALIZATION',
    entityType: 'System',
    entityId: 'SYSTEM-STARTUP',
    details: 'System initialized with OIML R-76 metrological rules engine',
    ipAddress: '127.0.0.1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'aud-02',
    userId: 'usr-officer-01',
    action: 'CREATE_SESSION',
    entityType: 'TestSession',
    entityId: 'sess-01',
    details: 'Inspection test session initiated for Weighbridge WB-2024-APMC-001',
    ipAddress: '192.168.1.100',
    createdAt: new Date('2026-03-01T10:00:00Z'),
  },
  {
    id: 'aud-03',
    userId: 'usr-officer-01',
    action: 'FINALIZE_SESSION',
    entityType: 'TestSession',
    entityId: 'sess-01',
    details: 'Test session finalized and cryptographically sealed under certificate NAWI-2026-000188',
    ipAddress: '192.168.1.100',
    createdAt: new Date('2026-03-01T12:00:00Z'),
  },
];

/**
 * Slide the entire seeded timeline forward so the newest event always sits a few
 * days before today.
 *
 * The demo dataset is written against fixed calendar dates, which means that a
 * few months after it was authored the dashboard's rolling-window charts go
 * empty, "Recent Test Sessions" stops looking recent, and every demo
 * certificate silently ages past its validity period. An evaluator opening the
 * portal would conclude the product is broken.
 *
 * Every record is shifted by the same whole number of days, so all relative
 * spacing is preserved exactly — instruments are still registered before the
 * sessions that test them, results still land mid-session, and the audit trail
 * still reads in order. Shifting by whole days also preserves the time of day,
 * so inspections stay during working hours instead of drifting to 03:47.
 *
 * Certificate numbers are deliberately NOT rewritten: they are opaque registry
 * identifiers referenced by QR codes, screenshots and the verification scripts.
 */
const DEMO_FRESHNESS_DAYS = 3;
const DATE_FIELDS = ['createdAt', 'updatedAt', 'startedAt', 'completedAt', 'sealedAt', 'lastCalibration', 'nextCalibration'];
const ALL_COLLECTIONS = [users, instruments, testSessions, testResults, auditLogs];

function rebaseTimelineToToday() {
  let newest = -Infinity;
  for (const collection of ALL_COLLECTIONS) {
    for (const record of collection) {
      for (const field of DATE_FIELDS) {
        const value = record[field];
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          newest = Math.max(newest, value.getTime());
        }
      }
    }
  }
  if (!Number.isFinite(newest)) return 0;

  const target = Date.now() - DEMO_FRESHNESS_DAYS * 86400000;
  const dayMs = 86400000;
  const offsetDays = Math.round((target - newest) / dayMs);
  if (offsetDays === 0) return 0;

  const offsetMs = offsetDays * dayMs;
  for (const collection of ALL_COLLECTIONS) {
    for (const record of collection) {
      for (const field of DATE_FIELDS) {
        const value = record[field];
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          record[field] = new Date(value.getTime() + offsetMs);
        }
      }
    }
  }
  return offsetDays;
}

// Order matters: the seal covers the verification date, so it must be computed
// only after the timeline has been rebased.
rebaseTimelineToToday();
computeAndAssignSeals();

function matchesFilter(item, where = {}) {
  if (!where || Object.keys(where).length === 0) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;

    if (k === 'OR' && Array.isArray(v)) {
      if (!v.some((cond) => matchesFilter(item, cond))) return false;
      continue;
    }
    if (k === 'AND' && Array.isArray(v)) {
      if (!v.every((cond) => matchesFilter(item, cond))) return false;
      continue;
    }
    if (k === 'NOT') {
      if (matchesFilter(item, v)) return false;
      continue;
    }

    if (k === 'email') {
      if (item.email?.toLowerCase() !== String(v).toLowerCase()) return false;
      continue;
    }

    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('contains' in v) {
        const itemVal = String(item[k] ?? '');
        const search = String(v.contains);
        if (v.mode === 'insensitive') {
          if (!itemVal.toLowerCase().includes(search.toLowerCase())) return false;
        } else {
          if (!itemVal.includes(search)) return false;
        }
        continue;
      }
      if ('startsWith' in v) {
        const itemVal = String(item[k] ?? '');
        if (!itemVal.startsWith(String(v.startsWith))) return false;
        continue;
      }
      if ('endsWith' in v) {
        const itemVal = String(item[k] ?? '');
        if (!itemVal.endsWith(String(v.endsWith))) return false;
        continue;
      }
      if ('in' in v && Array.isArray(v.in)) {
        if (!v.in.includes(item[k])) return false;
        continue;
      }
      if ('notIn' in v && Array.isArray(v.notIn)) {
        if (v.notIn.includes(item[k])) return false;
        continue;
      }
      if ('not' in v) {
        if (item[k] === v.not) return false;
        continue;
      }
      if ('equals' in v) {
        if (item[k] !== v.equals) return false;
        continue;
      }
      if ('gte' in v) {
        if (item[k] < v.gte) return false;
        continue;
      }
      if ('lte' in v) {
        if (item[k] > v.lte) return false;
        continue;
      }
      if ('gt' in v) {
        if (item[k] <= v.gt) return false;
        continue;
      }
      if ('lt' in v) {
        if (item[k] >= v.lt) return false;
        continue;
      }
      if (!matchesFilter(item, v)) return false;
      continue;
    }

    if (item[k] !== v) return false;
  }
  return true;
}

function hydrateSession(s) {
  const inst = instruments.find((i) => i.id === s.instrumentId);
  const officer = users.find((u) => u.id === s.conductedById);
  const results = testResults.filter((r) => r.testSessionId === s.id);
  return {
    ...s,
    instrument: inst || null,
    conductedBy: officer ? { id: officer.id, name: officer.name, email: officer.email, role: officer.role } : null,
    testResults: results,
  };
}

function hydrateResult(r) {
  const session = testSessions.find((s) => s.id === r.testSessionId);
  return {
    ...r,
    testSession: session ? hydrateSession(session) : null,
  };
}

function createModelHandler(collection, hydrator) {
  return {
    async findUnique(args = {}) {
      const { where = {} } = args;
      const item = collection.find((x) => matchesFilter(x, where));
      if (!item) return null;
      return hydrator ? hydrator(item) : { ...item };
    },
    async findFirst(args = {}) {
      const { where = {} } = args;
      const item = collection.find((x) => matchesFilter(x, where));
      if (!item) return null;
      return hydrator ? hydrator(item) : { ...item };
    },
    async findMany(args = {}) {
      const { where = {}, take, skip = 0, orderBy } = args;
      let list = collection.filter((x) => matchesFilter(x, where));
      if (hydrator) list = list.map(hydrator);
      if (orderBy && orderBy.createdAt === 'desc') {
        list = [...list].reverse();
      }
      if (typeof skip === 'number' && skip > 0) list = list.slice(skip);
      if (typeof take === 'number' && take > 0) list = list.slice(0, take);
      return list;
    },
    async count(args = {}) {
      const { where = {} } = args;
      return collection.filter((x) => matchesFilter(x, where)).length;
    },
    async create(args = {}) {
      const { data = {} } = args;
      const newItem = {
        id: data.id || `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (collection === testSessions && data.testResults?.create && Array.isArray(data.testResults.create)) {
        for (const tr of data.testResults.create) {
          testResults.push({
            id: tr.id || `mock-res-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            testSessionId: newItem.id,
            ...tr,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      collection.unshift(newItem);
      return hydrator ? hydrator(newItem) : { ...newItem };
    },
    async update(args = {}) {
      const { where = {}, data = {} } = args;
      const idx = collection.findIndex((x) => matchesFilter(x, where));
      if (idx === -1) throw new Error('Record to update not found');
      collection[idx] = {
        ...collection[idx],
        ...data,
        updatedAt: new Date(),
      };
      return hydrator ? hydrator(collection[idx]) : { ...collection[idx] };
    },
    async upsert(args = {}) {
      const { where = {}, create = {}, update = {} } = args;
      const idx = collection.findIndex((x) => matchesFilter(x, where));
      if (idx !== -1) {
        collection[idx] = { ...collection[idx], ...update, updatedAt: new Date() };
        return hydrator ? hydrator(collection[idx]) : { ...collection[idx] };
      }
      return this.create({ data: create });
    },
    async delete(args = {}) {
      const { where = {} } = args;
      const idx = collection.findIndex((x) => matchesFilter(x, where));
      if (idx === -1) throw new Error('Record to delete not found');
      const [removed] = collection.splice(idx, 1);
      return hydrator ? hydrator(removed) : { ...removed };
    },
    async groupBy(args = {}) {
      const { by = [] } = args;
      const map = {};
      collection.forEach((item) => {
        const key = by.map((f) => item[f]).join('__');
        if (!map[key]) map[key] = { key, count: 0, sample: item };
        map[key].count++;
      });
      return Object.values(map).map((entry) => {
        const res = { _count: { _all: entry.count } };
        by.forEach((f) => {
          res[f] = entry.sample[f];
        });
        return res;
      });
    },
  };
}

const mockDb = {
  user: createModelHandler(users),
  instrument: createModelHandler(instruments),
  testSession: createModelHandler(testSessions, hydrateSession),
  testResult: createModelHandler(testResults, hydrateResult),
  auditLog: createModelHandler(auditLogs),
  async $transaction(fnOrArray) {
    if (Array.isArray(fnOrArray)) {
      return Promise.all(fnOrArray);
    }
    if (typeof fnOrArray === 'function') {
      return fnOrArray(mockDb);
    }
    return fnOrArray;
  },
};

module.exports = mockDb;
