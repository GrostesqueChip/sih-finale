// Guarantees HMAC_SECRET is populated even when the seal engine is imported
// directly (tests, seeding, scripts) without going through src/index.js.
require('../lib/bootstrapEnv').bootstrapEnv({ silent: true });

const crypto = require('crypto');
const { getMPE, calculateIndicationAndError, calculateMultiIntervalMPE } = require('./mpeCalculator');

const DEFAULT_SECRET = process.env.HMAC_SECRET;

/**
 * Normalize and canonicalize session verification fields into deterministic string
 * @param {Object} data - Session and instrument verification data
 * @returns {string} Canonicalized payload string
 */
function canonicalizePayload(data) {
  if (!data) return '';
  
  const certNo = String(data.certificateNo || data.certificateNumber || '').trim();
  const instId = String(data.instrumentId || data.instrument?.id || data.instrument?.serialNumber || '').trim();
  const status = String(data.status || data.overallResult || 'VERIFIED_LEGAL').trim().toUpperCase();
  
  let date = data.verificationDate || data.completedAt || data.createdAt || '';
  if (date instanceof Date) {
    date = date.toISOString();
  } else if (typeof date === 'string' && date.trim()) {
    date = date.trim();
  } else {
    date = String(date || '').trim();
  }

  const officer = String(
    data.officerId ||
    data.verificationOfficer?.name ||
    data.conductedBy?.name ||
    data.conductedBy?.id ||
    (typeof data.conductedBy === 'string' ? data.conductedBy : '') ||
    ''
  ).trim();

  const maxCap = String(data.maxCapacity ?? data.instrument?.maxCapacity ?? '').trim();
  const eVal = String(data.verificationInterval ?? data.instrument?.verificationInterval ?? '').trim();

  return `CERT:${certNo}|INST:${instId}|CAP:${maxCap}|E:${eVal}|STATUS:${status}|DATE:${date}|OFFICER:${officer}`;
}

/**
 * Generate HMAC-SHA256 digital signature seal
 * @param {Object|string} data - Session data object or canonical string
 * @param {string} [secretKey] - Optional secret key (defaults to env HMAC_SECRET)
 * @returns {string} Hex-encoded HMAC-SHA256 signature
 */
function generateVerificationSeal(data, secretKey = DEFAULT_SECRET) {
  const secret = secretKey || DEFAULT_SECRET;
  const payload = typeof data === 'string' ? data : canonicalizePayload(data);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return hmac.digest('hex');
}

/**
 * Verify if a given HMAC signature matches the session data
 * Uses constant-time buffer comparison to prevent timing attacks
 * 
 * @param {Object|string} data - Session data object or canonical string
 * @param {string} signature - Hex-encoded signature to verify
 * @param {string} [secretKey] - Optional secret key
 * @returns {boolean} True if signature is authentic and untampered
 */
function verifySealSignature(data, signature, secretKey = DEFAULT_SECRET) {
  if (!signature || typeof signature !== 'string') return false;
  
  // Must be a valid 64-character hex string
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }

  try {
    const expectedSeal = generateVerificationSeal(data, secretKey);
    const sigBuf = Buffer.from(signature.toLowerCase(), 'hex');
    const expBuf = Buffer.from(expectedSeal.toLowerCase(), 'hex');

    if (sigBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Create a complete tamper-proof verification seal package
 * @param {Object} session - Test session data
 * @param {string} [secretKey]
 * @returns {Object} { sealSignature, canonicalPayload, timestamp, algorithm: 'HMAC-SHA256' }
 */
function createTamperProofSeal(session, secretKey = DEFAULT_SECRET) {
  const canonicalPayload = canonicalizePayload(session);
  const sealSignature = generateVerificationSeal(canonicalPayload, secretKey);
  
  return {
    sealSignature,
    canonicalPayload,
    algorithm: 'HMAC-SHA256',
    generatedAt: new Date().toISOString(),
    standard: 'OIML R-76 Tamper-Evident Verification Seal',
  };
}

/**
 * Pre-computes error envelope curve points for public API consumers and charting
 * Conforming to OIML R-76-1 Table 3 & Clause 3.4
 * 
 * @param {Array<Object>} testPoints - Raw or calculated test points
 * @param {Object} instrument - Instrument specifications { accuracyClass, verificationInterval, maxCapacity, ranges }
 * @param {boolean} [isInService=false] - Whether in-service limits apply (2x initial MPE)
 * @returns {Array<Object>} Formatted curve points with MPE boundaries and error values
 */
function computeErrorCurvePoints(testPoints = [], instrument = {}, isInService = false) {
  const accClass = instrument?.accuracyClass || 'CLASS_III';
  const e = Number(instrument?.verificationInterval || 1);
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || null;

  if (!Array.isArray(testPoints) || testPoints.length === 0) {
    // Generate standard envelope points across span
    const maxCap = Number(instrument?.maxCapacity || 1000);
    const nominalLoads = [0, maxCap * 0.1, maxCap * 0.25, maxCap * 0.5, maxCap * 0.75, maxCap];
    return nominalLoads.map(load => {
      let mpeMass;
      if (ranges && ranges.length > 0) {
        const mpeRes = calculateMultiIntervalMPE(load, accClass, ranges, isInService);
        mpeMass = mpeRes.mpe;
      } else {
        const mpeE = getMPE(accClass, load / e, isInService);
        mpeMass = mpeE * e;
      }
      return {
        load,
        indicatedValue: load,
        continuousIndication: load,
        error: 0,
        mpeUpper: Number(mpeMass.toFixed(6)),
        mpeLower: Number((-mpeMass).toFixed(6)),
        isPass: true,
        isIncreasing: true,
      };
    });
  }

  return testPoints.map(pt => {
    const load = Number(pt.appliedLoad ?? pt.load ?? 0);
    let mpeMass;
    if (ranges && ranges.length > 0) {
      const mpeRes = calculateMultiIntervalMPE(load, accClass, ranges, isInService);
      mpeMass = mpeRes.mpe;
    } else {
      const mpeE = getMPE(accClass, load / e, isInService);
      mpeMass = mpeE * e;
    }

    let error = 0;
    let continuousIndication = pt.indicatedValue ?? load;

    if (pt.correctedError !== undefined && pt.correctedError !== null) {
      error = Number(pt.correctedError);
    } else if (pt.error !== undefined && pt.error !== null) {
      error = Number(pt.error);
    } else if (pt.indicatedValue !== undefined) {
      const calc = calculateIndicationAndError(load, pt.indicatedValue, e, pt.deltaL);
      error = calc.error;
      continuousIndication = calc.continuousIndication;
    }

    const isPass = Math.abs(error) <= mpeMass + 1e-9;

    return {
      load,
      indicatedValue: pt.indicatedValue !== undefined ? Number(pt.indicatedValue) : undefined,
      continuousIndication: Number(Number(continuousIndication).toFixed(6)),
      error: Number(error.toFixed(6)),
      mpeUpper: Number(mpeMass.toFixed(6)),
      mpeLower: Number((-mpeMass).toFixed(6)),
      isPass,
      isIncreasing: pt.isIncreasing !== false,
      deltaL: pt.deltaL !== undefined ? Number(pt.deltaL) : undefined,
    };
  });
}

/**
 * Canonical seal-input builder — the SINGLE source of truth for which session
 * fields enter the HMAC seal. Every call site (finalize, verify, demo seed, mock
 * DB) MUST build the seal from this helper so signatures match across the app.
 *
 * Officer identity is keyed to the immutable user id (conductedById), never the
 * display name, so renaming an officer never invalidates an already-issued
 * certificate — and so the seal computed at finalize time (where only the id is
 * reliably present) matches the seal recomputed at verify time.
 *
 * @param {Object} session - Session with instrument + conductedBy(optional) included
 * @returns {Object} Canonical field bag for generateVerificationSeal()
 */
function buildSealInput(session = {}) {
  const inst = session.instrument || {};
  const rawDate = session.completedAt || session.sealedAt || session.createdAt || new Date();
  const verificationDate =
    rawDate instanceof Date ? rawDate.toISOString() : new Date(rawDate).toISOString();

  return {
    certificateNo: session.certificateNo,
    instrumentId: inst.id || inst.serialNumber || session.instrumentId,
    status: String(session.status || '').toUpperCase(),
    verificationDate,
    officerId: String(session.conductedById || session.conductedBy?.id || ''),
    maxCapacity: inst.maxCapacity,
    verificationInterval: inst.verificationInterval,
  };
}

module.exports = {
  canonicalizePayload,
  generateVerificationSeal,
  verifySealSignature,
  createTamperProofSeal,
  computeErrorCurvePoints,
  buildSealInput,
};
