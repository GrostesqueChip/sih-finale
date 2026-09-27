import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import { generateVerificationSeal, verifySealSignature } from '../../server/src/services/cryptoSeal';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';
import prisma from '../../server/src/lib/prisma';

describe('Tier 4: Workload Scenario 3 - End-to-End Public QR Scan Verification Lifecycle', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const certificateNo = 'CERT-2026-APMC-PUNJAB-9901';

  it('T4-S3-TC1: should simulate entire lifecycle: Officer Calibration -> Digital Seal Creation -> QR Portal Scan', async () => {
    // Step 1: Officer conducts test and generates official session
    const officialSession = {
      id: 'session-apmc-punjab-01',
      certificateNo,
      status: 'VERIFIED_LEGAL',
      overallResult: 'PASS',
      createdAt: new Date('2026-08-30T09:00:00.000Z'),
      completedAt: new Date('2026-08-30T09:30:00.000Z'),
      instrument: wb,
      conductedBy: MOCK_OFFICER,
      testResults: [
        {
          testType: 'WEIGHING_PERFORMANCE',
          data: {
            points: [
              { appliedLoad: 0, indicatedValue: 0, deltaL: 10, correctedError: 0 },
              { appliedLoad: 10000, indicatedValue: 10000, deltaL: 10, correctedError: 0 },
              { appliedLoad: 30000, indicatedValue: 30005, deltaL: 10, correctedError: 5 },
              { appliedLoad: 60000, indicatedValue: 60000, deltaL: 10, correctedError: 0 },
            ],
          },
        },
      ],
    };

    // Step 2: Generate official cryptographic HMAC seal
    const seal = generateVerificationSeal({
      certificateNo,
      instrumentId: wb.id || wb.serialNumber,
      status: 'VERIFIED_LEGAL',
      verificationDate: officialSession.completedAt.toISOString(),
      officerId: MOCK_OFFICER.id || MOCK_OFFICER.name,
      maxCapacity: wb.maxCapacity,
      verificationInterval: wb.verificationInterval,
    });

    expect(seal).toHaveLength(64);

    // The finalized session stores this HMAC seal (officer field keyed to the
    // immutable user id, matching tests.routes.js finalize + buildSealInput).
    officialSession.verificationSeal = seal;

    // Step 3: Grain trader scans QR code linking to public URL
    // e.g. https://nawi-reportpro.gov.in/verify/CERT-2026-APMC-PUNJAB-9901
    const spy = vi.spyOn(prisma.testSession, 'findUnique').mockResolvedValueOnce(officialSession);

    const res = await request(app).get(`/api/reports/verify/${certificateNo}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.certificateNumber).toBe(certificateNo);
    expect(res.body.status).toBe('VERIFIED_LEGAL');
    expect(res.body.instrument.name).toBe(wb.name);
    expect(res.body.verificationOfficer.name).toBe(MOCK_OFFICER.name);
    expect(res.body.errorCurveData).toHaveLength(4);

    // Step 4: Verification card UI cryptographically verifies legal seal integrity
    const isAuthentic = verifySealSignature({
      certificateNo: res.body.certificateNumber,
      instrumentId: res.body.instrument.id || res.body.instrument.serialNumber,
      status: res.body.status,
      verificationDate: res.body.verificationDate,
      officerId: MOCK_OFFICER.id,
      maxCapacity: res.body.instrument.maxCapacity,
      verificationInterval: res.body.instrument.verificationInterval,
    }, res.body.sealSignature);

    expect(isAuthentic).toBe(true);

    spy.mockRestore();
  });

  it('T4-S3-TC2: should immediately alert consumer if a fraudulent trader displays a forged or modified certificate', async () => {
    // Genuine session was for Max Capacity = 30 kg (grocery scale)
    const groceryScale = {
      ...wb,
      maxCapacity: 30,
      verificationInterval: 0.005,
    };

    const genuineSeal = generateVerificationSeal({
      certificateNo: 'CERT-2026-GENUINE-GROCERY',
      instrumentId: 'SN-GROCERY-01',
      status: 'VERIFIED_LEGAL',
      verificationDate: '2026-08-30T10:00:00.000Z',
      officerId: MOCK_OFFICER.name,
      maxCapacity: 30,
      verificationInterval: 0.005,
    });

    // Fraudulent merchant photocopies QR and sticks it onto a 60,000 kg weighbridge
    const forgedScannedData = {
      certificateNo: 'CERT-2026-GENUINE-GROCERY',
      instrumentId: 'SN-WEIGHBRIDGE-60T', // Tampered instrument ID
      status: 'VERIFIED_LEGAL',
      verificationDate: '2026-08-30T10:00:00.000Z',
      officerId: MOCK_OFFICER.name,
      maxCapacity: 60000,                // Tampered capacity
      verificationInterval: 20,
    };

    const isFraudulentVerified = verifySealSignature(forgedScannedData, genuineSeal);
    expect(isFraudulentVerified).toBe(false);
  });
});
