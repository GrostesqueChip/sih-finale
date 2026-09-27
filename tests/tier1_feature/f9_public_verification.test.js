import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';
import { generateVerificationSeal, buildSealInput } from '../../server/src/services/cryptoSeal';
import prisma from '../../server/src/lib/prisma';

describe('Tier 1: Feature 9 - Public Verification Portal & QR Code Verification Route', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const mockCertificateNo = 'CERT-2026-WB-9901';

  it('F9-TC1: should allow unauthenticated access to public verification route without auth token', async () => {
    // Unauthenticated GET request to /api/reports/verify/:certificateNo
    const res = await request(app).get(`/api/reports/verify/NON_EXISTENT_CERT`);
    // Should NOT return 401 Unauthorized; should return 404 with public payload
    expect(res.status).toBe(404);
    expect(res.body.valid).toBe(false);
    expect(res.body.message).toContain('not found');
  });

  it('F9-TC2: should return full instrument metadata and legal metrology status for valid certificate', async () => {
    // Spy on prisma.testSession.findUnique
    const mockSession = {
      id: 'session-001',
      certificateNo: mockCertificateNo,
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: new Date('2026-08-15'),
      completedAt: new Date('2026-08-15'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          status: 'COMPLETED',
          result: 'PASS',
          data: {
            points: [
              { appliedLoad: 0, indicatedValue: 0, deltaL: 10, continuousIndication: 0, error: 0 },
              { appliedLoad: 30000, indicatedValue: 30000, deltaL: 10, continuousIndication: 30000, error: 0 },
              { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10, continuousIndication: 60000, error: 0 },
            ],
          },
        },
      ],
    };

    // A finalized session carries a stored HMAC seal (keyed to the immutable
    // officer id, exactly as tests.routes.js finalize computes it).
    mockSession.verificationSeal = generateVerificationSeal(buildSealInput(mockSession));

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockSession);

    const res = await request(app).get(`/api/reports/verify/${mockCertificateNo}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.certificateNumber).toBe(mockCertificateNo);
    expect(res.body.instrument.name).toBe(wb.name);
    expect(res.body.instrument.accuracyClass).toBe(wb.accuracyClass);
    expect(res.body.verificationOfficer.name).toBe(MOCK_OFFICER.name);
    expect(res.body.sealSignature).toBeDefined();
    expect(typeof res.body.sealSignature).toBe('string');
    expect(res.body.errorCurveData).toHaveLength(3);

    spy.mockRestore();
  });

  it('F9-TC3: should provide pre-calculated error curve envelope points for public visual inspection', async () => {
    const mockSession = {
      id: 'session-002',
      certificateNo: 'CERT-2026-WB-CURVE',
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: new Date('2026-08-15'),
      completedAt: new Date('2026-08-15'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          data: {
            points: [
              { appliedLoad: 10000, indicatedValue: 10005, deltaL: 10, correctedError: 5 },
            ],
          },
        },
      ],
    };

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockSession);

    const res = await request(app).get(`/api/reports/verify/CERT-2026-WB-CURVE`);
    expect(res.status).toBe(200);
    expect(res.body.errorCurveData[0].load).toBe(10000);
    expect(res.body.errorCurveData[0].error).toBe(5);
    expect(res.body.errorCurveData[0].mpeUpper).toBe(10);
    expect(res.body.errorCurveData[0].mpeLower).toBe(-10);

    spy.mockRestore();
  });

  it('F9-TC4: should return valid=false and status=REJECTED when a failed instrument certificate is queried', async () => {
    const mockRejectedSession = {
      id: 'session-rej-001',
      certificateNo: 'CERT-2026-WB-FAILED',
      status: 'REJECTED',
      overallResult: 'FAIL',
      createdAt: new Date('2026-08-15'),
      completedAt: new Date('2026-08-15'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [],
    };

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockRejectedSession);

    const res = await request(app).get(`/api/reports/verify/CERT-2026-WB-FAILED`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.status).toBe('REJECTED');

    spy.mockRestore();
  });

  it('F9-TC5: should compute valid 1-year verification expiry date according to Legal Metrology Rules', async () => {
    const vDate = new Date('2026-04-01T10:00:00.000Z');
    const mockSession = {
      id: 'session-005',
      certificateNo: 'CERT-2026-EXPIRY-TEST',
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: vDate,
      completedAt: vDate,
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [],
    };

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockSession);

    const res = await request(app).get(`/api/reports/verify/CERT-2026-EXPIRY-TEST`);
    expect(res.status).toBe(200);
    const expiry = new Date(res.body.expiryDate);
    expect(expiry.getFullYear()).toBe(2027);
    expect(expiry.getMonth()).toBe(3); // April

    spy.mockRestore();
  });
});
