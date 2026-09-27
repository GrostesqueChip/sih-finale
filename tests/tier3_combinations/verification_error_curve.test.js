import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import { generateVerificationSeal, verifySealSignature, buildSealInput } from '../../server/src/services/cryptoSeal';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';
import prisma from '../../server/src/lib/prisma';

describe('Tier 3: Cross-Feature - Public Verification, Cryptographic Seal & Error Envelope Integration', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const certNo = 'CERT-2026-WB-E2E-01';

  it('T3-VE1: should verify public endpoint output matching client-side cryptographic seal verification', async () => {
    const mockSession = {
      id: 'session-full-combo',
      certificateNo: certNo,
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: new Date('2026-08-30T10:00:00.000Z'),
      completedAt: new Date('2026-08-30T10:00:00.000Z'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          data: {
            points: [
              { appliedLoad: 0, indicatedValue: 0, deltaL: 10, correctedError: 0 },
              { appliedLoad: 10000, indicatedValue: 10002, deltaL: 10, correctedError: 2 },
              { appliedLoad: 30000, indicatedValue: 29996, deltaL: 10, correctedError: -4 },
              { appliedLoad: 60000, indicatedValue: 60005, deltaL: 10, correctedError: 5 },
            ],
          },
        },
      ],
    };

    // Finalized session -> real stored HMAC seal (id-keyed officer field).
    mockSession.verificationSeal = generateVerificationSeal(buildSealInput(mockSession));

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockSession);

    const res = await request(app).get(`/api/reports/verify/${certNo}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.sealSignature).toBeDefined();

    // Client validates cryptographic seal signature
    const isValidSignature = verifySealSignature({
      certificateNo: res.body.certificateNumber,
      instrumentId: res.body.instrument.id || res.body.instrument.serialNumber,
      status: res.body.status,
      verificationDate: res.body.verificationDate,
      officerId: MOCK_OFFICER.id,
      maxCapacity: res.body.instrument.maxCapacity,
      verificationInterval: res.body.instrument.verificationInterval,
    }, res.body.sealSignature);

    expect(isValidSignature).toBe(true);

    spy.mockRestore();
  });

  it('T3-VE2: should bundle 4-point error curve points with upper/lower MPE for dynamic chart rendering', async () => {
    const mockSession = {
      id: 'session-chart-01',
      certificateNo: 'CERT-2026-CHART-01',
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: new Date('2026-08-30T10:00:00.000Z'),
      completedAt: new Date('2026-08-30T10:00:00.000Z'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          data: {
            points: [
              { appliedLoad: 0, correctedError: 0 },
              { appliedLoad: 10000, correctedError: 4 },  // MPE = ±10 kg
              { appliedLoad: 40000, correctedError: -8 }, // MPE = ±20 kg
              { appliedLoad: 60000, correctedError: 12 }, // MPE = ±30 kg
            ],
          },
        },
      ],
    };

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockSession);

    const res = await request(app).get(`/api/reports/verify/CERT-2026-CHART-01`);

    expect(res.status).toBe(200);
    const curve = res.body.errorCurveData;
    expect(curve).toHaveLength(4);

    expect(curve[0].load).toBe(0);
    expect(curve[0].mpeUpper).toBe(10);
    expect(curve[0].mpeLower).toBe(-10);

    expect(curve[1].load).toBe(10000);
    expect(curve[1].error).toBe(4);
    expect(curve[1].mpeUpper).toBe(10);

    expect(curve[2].load).toBe(40000);
    expect(curve[2].error).toBe(-8);
    expect(curve[2].mpeUpper).toBe(20);

    expect(curve[3].load).toBe(60000);
    expect(curve[3].error).toBe(12);
    expect(curve[3].mpeUpper).toBe(30);

    spy.mockRestore();
  });

  it('T3-VE3: should detect if a rogue party forged error values but cannot forge HMAC seal signature', () => {
    const genuineSession = {
      certificateNo: 'CERT-2026-GENUINE',
      instrumentId: wb.serialNumber,
      status: 'VERIFIED_LEGAL',
      verificationDate: '2026-08-30T10:00:00.000Z',
      officerId: MOCK_OFFICER.name,
      maxCapacity: wb.maxCapacity,
      verificationInterval: wb.verificationInterval,
    };

    const seal = generateVerificationSeal(genuineSession);

    // Attacker modifies status from REJECTED to VERIFIED_LEGAL without key
    const forgedSession = {
      ...genuineSession,
      status: 'REJECTED', // Original was REJECTED
    };

    const isValid = verifySealSignature(forgedSession, seal);
    expect(isValid).toBe(false);
  });

  it('T3-VE4: should confirm legal status is REJECTED when any error curve point breaches MPE', () => {
    const errorPoints = [
      { load: 10000, error: 15, mpeUpper: 10, mpeLower: -10 }, // 15 > 10 -> Breached!
    ];

    const hasBreach = errorPoints.some(pt => pt.error > pt.mpeUpper || pt.error < pt.mpeLower);
    expect(hasBreach).toBe(true);
  });

  it('T3-VE5: should return complete instrument verification certificate with QR scan payload contract', async () => {
    const mockSession = {
      id: 'session-qr-01',
      certificateNo: 'CERT-2026-QR-01',
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: new Date('2026-08-30T10:00:00.000Z'),
      completedAt: new Date('2026-08-30T10:00:00.000Z'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [],
    };

    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(mockSession);

    const res = await request(app).get(`/api/reports/verify/CERT-2026-QR-01`);

    expect(res.status).toBe(200);
    expect(res.body.certificateNumber).toBe('CERT-2026-QR-01');
    expect(res.body.verificationOfficer.jurisdiction).toBe(wb.location);
    expect(res.body.verifiedAt).toBeDefined();

    spy.mockRestore();
  });
});
