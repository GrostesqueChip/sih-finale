const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { generateCertificatePdf, generateDatasheetPdf } = require('../services/pdfGenerator');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');
const { generateVerificationSeal, verifySealSignature, computeErrorCurvePoints, buildSealInput } = require('../services/cryptoSeal');
const { getMPE } = require('../services/mpeCalculator');

/**
 * GET /api/reports/:sessionId/certificate
 * Generate and return official Verification Certificate PDF (authenticated)
 */
async function getCertificatePdf(req, res, next) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true, role: true } },
        testResults: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }

    // Integrity gate (audit B-P0-3): a certificate PDF is an official legal
    // document. Never emit one for a session that has not been finalized and
    // cryptographically sealed — otherwise an IN_PROGRESS session yields an
    // official-looking certificate with a fabricated officer and verdict.
    const certIsSealed =
      Boolean(session.verificationSeal) &&
      (session.status === 'COMPLETED' || session.status === 'FAILED');
    if (!certIsSealed) {
      return res.status(409).json({
        success: false,
        message:
          'Certificate is not available: this verification session has not been finalized and sealed yet.',
        status: session.status,
      });
    }

    const pdfBuffer = await generateCertificatePdf(session);

    if (req.user) {
      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'GENERATE_CERTIFICATE_PDF',
        entityType: 'TestSession',
        entityId: sessionId,
        details: `Generated official certificate PDF for ${session.certificateNo}`,
        ipAddress: clientIp,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Certificate_${session.certificateNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/:sessionId/datasheet
 * Generate and return detailed Technical Data Sheet PDF (authenticated)
 */
async function getDatasheetPdf(req, res, next) {
  try {
    const { sessionId } = req.params;

    const session = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        instrument: true,
        conductedBy: { select: { id: true, name: true, email: true, role: true } },
        testResults: true,
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Test session not found' });
    }

    // Integrity gate (audit B-P0-3): the technical datasheet is issued only for a
    // finalized, sealed session — never for an in-progress or unsealed one.
    const sheetIsSealed =
      Boolean(session.verificationSeal) &&
      (session.status === 'COMPLETED' || session.status === 'FAILED');
    if (!sheetIsSealed) {
      return res.status(409).json({
        success: false,
        message:
          'Data sheet is not available: this verification session has not been finalized and sealed yet.',
        status: session.status,
      });
    }

    const pdfBuffer = await generateDatasheetPdf(session);

    if (req.user) {
      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'GENERATE_DATASHEET_PDF',
        entityType: 'TestSession',
        entityId: sessionId,
        details: `Generated technical data sheet PDF for ${session.certificateNo}`,
        ipAddress: clientIp,
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Datasheet_${session.certificateNo}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/reports/verify/:certificateNo
 * Public endpoint for QR verification lookup conforming to OIML R-76 and Legal Metrology standard
 */
async function verifyCertificate(req, res, next) {
  try {
    const { certificateNo } = req.params;

    let session = null;
    try {
      if (prisma && prisma.testSession) {
        session = await prisma.testSession.findUnique({
          where: { certificateNo },
          include: {
            instrument: true,
            conductedBy: { select: { id: true, name: true, email: true, role: true } },
            testResults: true,
          },
        });
      }
    } catch (dbErr) {
      session = null;
    }

    if (!session) {
      return res.status(404).json({
        valid: false,
        success: false,
        message: `Certificate with reference '${certificateNo}' was not found in the national registry.`,
      });
    }

    const inst = session.instrument || {};
    const e = Number(inst.verificationInterval || 1);
    const accClass = inst.accuracyClass || 'CLASS_III';

    // Extract or compute error curve data from WEIGHING_PERFORMANCE test results
    const weighingTest = session.testResults?.find(
      (t) => t.testType === 'WEIGHING_PERFORMANCE' || t.testType === 'WEIGHING'
    );

    let errorCurveData = [];
    if (weighingTest && weighingTest.data && Array.isArray(weighingTest.data.points)) {
      errorCurveData = computeErrorCurvePoints(weighingTest.data.points, inst, false);
    } else {
      // Default standard envelope points
      errorCurveData = computeErrorCurvePoints([], inst, false);
    }

    // Determine verification and expiry dates
    const rawDate = session.completedAt || session.sealedAt || session.createdAt || new Date();
    const verificationDate = rawDate instanceof Date ? rawDate.toISOString() : new Date(rawDate).toISOString();

    const vDateObj = new Date(verificationDate);
    const expDateObj = new Date(vDateObj);
    expDateObj.setFullYear(vDateObj.getFullYear() + 1);
    const expiryDate = expDateObj.toISOString();
    const isExpired = Date.now() > expDateObj.getTime();

    // --- Three ORTHOGONAL axes, never conflated into one boolean (audit B-P0-1) ---

    // 1) Metrological verdict — the recorded PASS/FAIL outcome. Never fabricated,
    //    never defaulted to PASS. Derived from the stored result, falling back to
    //    the sealed lifecycle status only when overallResult is genuinely absent.
    let verdict = session.overallResult || null;
    if (!verdict) {
      if (session.status === 'COMPLETED') verdict = 'PASS';
      else if (session.status === 'FAILED') verdict = 'FAIL';
      else verdict = 'UNKNOWN';
    }

    // 2) Authenticity — is the stored seal genuine and untampered? Recompute the
    //    seal from the canonical input (the identical builder used at finalize
    //    time) and compare in constant time. An unsealed session is not authentic.
    const storedSeal = session.verificationSeal || null;
    const computedSeal = generateVerificationSeal(buildSealInput(session));
    let sealVerified = false;
    if (storedSeal) {
      try {
        const storedBuf = Buffer.from(String(storedSeal).toLowerCase(), 'hex');
        const computedBuf = Buffer.from(computedSeal.toLowerCase(), 'hex');
        sealVerified =
          storedBuf.length === 32 &&
          computedBuf.length === 32 &&
          crypto.timingSafeEqual(storedBuf, computedBuf);
      } catch (err) {
        sealVerified = false;
      }
    }

    // Optional incoming seal from a QR scan (?seal= / x-verify-seal) must also
    // match the seal on record, otherwise the scanned artifact is not authentic.
    const incomingSeal = req.query.seal || req.headers['x-verify-seal'];
    if (incomingSeal && storedSeal) {
      try {
        const incomingBuf = Buffer.from(String(incomingSeal).toLowerCase(), 'hex');
        const expectedBuf = Buffer.from(String(storedSeal).toLowerCase(), 'hex');
        if (incomingBuf.length !== 32 || !crypto.timingSafeEqual(incomingBuf, expectedBuf)) {
          sealVerified = false;
        }
      } catch (err) {
        sealVerified = false;
      }
    }

    const authentic = Boolean(storedSeal) && sealVerified;

    // 3) Validity window — within the statutory 1-year period.
    const withinValidity = !isExpired;

    // Resolved single-word status for the badge (collapses the axes for display).
    // A genuine seal on a FAIL reads REJECTED (authentic), NOT TAMPERED.
    let finalStatus;
    if (storedSeal && !sealVerified) finalStatus = 'TAMPERED';
    else if (verdict === 'FAIL') finalStatus = 'REJECTED';
    else if (verdict === 'PASS' && isExpired) finalStatus = 'EXPIRED';
    else if (verdict === 'PASS') finalStatus = 'VERIFIED_LEGAL';
    else finalStatus = 'UNKNOWN';

    // Legacy "valid" = safe for commercial/trade use right now (authentic PASS,
    // in validity). An authentically-sealed FAIL is authentic:true but valid:false.
    const isOfficiallyValid = authentic && verdict === 'PASS' && withinValidity;

    // Officer identity is NEVER fabricated. Absent officer -> null (UI shows "—").
    const officerName = session.conductedBy?.name || null;
    const officerDesignation = officerName
      ? session.conductedBy?.role === 'ADMIN'
        ? 'Controller of Legal Metrology'
        : 'Inspector of Legal Metrology'
      : null;

    const responsePayload = {
      valid: isOfficiallyValid,
      authentic,
      verdict,
      withinValidity,
      success: true,
      certificateNumber: session.certificateNo,
      certificateNo: session.certificateNo,
      instrument: {
        id: inst.id,
        name: inst.name || null,
        model: inst.model || null,
        serialNumber: inst.serialNumber || null,
        accuracyClass: inst.accuracyClass || null,
        maxCapacity: inst.maxCapacity != null ? Number(inst.maxCapacity) : null,
        minCapacity: inst.minCapacity != null ? Number(inst.minCapacity) : null,
        verificationInterval: inst.verificationInterval != null ? Number(inst.verificationInterval) : null,
        actualInterval:
          inst.actualInterval != null
            ? Number(inst.actualInterval)
            : inst.verificationInterval != null
            ? Number(inst.verificationInterval)
            : null,
        unit: inst.unit || 'kg',
        location: inst.location || null,
        ranges: inst.ranges || inst.multiIntervalRanges || null,
      },
      verificationDate,
      expiryDate,
      status: finalStatus,
      overallResult: verdict,
      verificationOfficer: officerName
        ? {
            name: officerName,
            designation: officerDesignation,
            jurisdiction: inst.location || null,
            email: session.conductedBy?.email || null,
          }
        : null,
      conductedBy: officerName,
      sealSignature: storedSeal,
      sealedAt: session.sealedAt || session.completedAt || null,
      sealVerified,
      errorCurveData,
      testResults: session.testResults,
      verifiedAt: new Date().toISOString(),
    };

    return res.json(responsePayload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCertificatePdf,
  getDatasheetPdf,
  verifyCertificate,
};
