import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FiSave,
  FiArrowLeft,
  FiCheckCircle,
  FiInfo,
  FiLayers,
  FiUploadCloud,
  FiLock,
} from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import SerialTelemetryToolbar from '../../components/telemetry/SerialTelemetryToolbar';
import BatchCsvModal from '../../components/batch/BatchCsvModal';
import {
  calculateMpe,
  calculateContinuousIndication,
  calculateCorrectedError,
  roundTo,
} from '../../utils/metrology';

/**
 * A reading is "filled" only if the officer actually typed a finite number.
 * Blank / null / non-numeric entries are NOT coerced into a value — doing so
 * would fabricate a passing reading, which is a legal-metrology disqualifier.
 */
function isFilled(v) {
  return v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v));
}

/** Numeric value when genuinely entered, otherwise null (never a fabricated default). */
function numOrNull(v) {
  return isFilled(v) ? Number(v) : null;
}

/**
 * Pure completeness assessment for a test module. Counts how many required
 * readings are still blank so we can BLOCK finalization (Save & Complete) of a
 * module that would otherwise be sealed with fabricated / missing data.
 */
function assessModuleCompleteness(testType, ctx) {
  const type = (testType || '').toUpperCase();
  let total = 0;
  let filled = 0;
  const countField = (arr, field) => {
    (arr || []).forEach((row) => {
      total += 1;
      if (isFilled(row[field])) filled += 1;
    });
  };

  if (type === 'WEIGHING_PERFORMANCE' || type === 'WEIGHING') {
    countField(ctx.weighingPoints, 'incReading');
    countField(ctx.weighingPoints, 'decReading');
  } else if (type === 'REPEATABILITY') {
    countField(ctx.repeatabilityHalf, 'reading');
    countField(ctx.repeatabilityFull, 'reading');
  } else if (type === 'ECCENTRICITY') {
    countField(ctx.eccentricityPoints, 'reading');
  } else if (type === 'TEMPERATURE' || type === 'TEMPERATURE_EFFECTS') {
    countField(ctx.temperaturePoints, 'zeroReading');
    countField(ctx.temperaturePoints, 'spanReading');
  } else if (type === 'STABILITY') {
    countField(ctx.stabilityPoints, 'reading');
  } else if (type === 'TIME_DEPENDENCE') {
    countField(ctx.creepPoints, 'reading');
    total += 1;
    if (isFilled(ctx.zeroReturnReading)) filled += 1;
  }

  const missing = total - filled;
  return { total, filled, missing, complete: total > 0 && missing === 0 };
}

export default function TestDataEntryPage() {
  const { t } = useTranslation();
  const { id: sessionId, testType } = useParams();
  const navigate = useNavigate();

  // Normalize testType string
  const normalizedTestType = (testType || 'WEIGHING_PERFORMANCE').toUpperCase();

  // Fetch session and instrument info
  const { data: session, isLoading } = useQuery({
    queryKey: ['test-session', sessionId],
    queryFn: async () => {
      const res = await apiClient.get(`/tests/${sessionId}`);
      const raw = res.data?.data || res.data;
      return {
        ...raw,
        certificateNumber: raw.certificateNo || raw.certificateNumber,
        instrument: raw.instrument ? {
          ...raw.instrument,
          verificationScaleInterval_e: raw.instrument.verificationInterval ?? raw.instrument.verificationScaleInterval_e,
          actualScaleInterval_d: raw.instrument.actualInterval ?? raw.instrument.actualScaleInterval_d,
        } : null,
      };
    },
  });

  const instrument = session?.instrument || {
    accuracyClass: 'CLASS_III',
    maxCapacity: 150,
    minCapacity: 1,
    verificationScaleInterval_e: 0.05,
    unit: 'kg',
    verificationType: 'INITIAL',
  };

  const isInitial = instrument.verificationType !== 'IN_SERVICE';
  const isReadOnly = session?.status === 'COMPLETED';

  // -------------------------------------------------------------
  // STATE FOR TEST MODULES
  // -------------------------------------------------------------

  // 1. Weighing Performance state (6 standard load points: 0, 20%, 40%, 60%, 80%, 100% of Max)
  const [weighingPoints, setWeighingPoints] = useState([]);

  // 2. Repeatability state (50% Max and 100% Max with 6 readings each)
  const [repeatabilityHalf, setRepeatabilityHalf] = useState([
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
  ]);
  const [repeatabilityFull, setRepeatabilityFull] = useState([
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
    { reading: '', deltaL: 0 },
  ]);

  // 3. Eccentricity state (5 positions: Center, Top-Left, Top-Right, Bottom-Right, Bottom-Left)
  const [eccentricityPoints, setEccentricityPoints] = useState([
    { position: 'Center (Pos 1)', reading: '', deltaL: 0 },
    { position: 'Top-Left / Front-Left (Pos 2)', reading: '', deltaL: 0 },
    { position: 'Top-Right / Front-Right (Pos 3)', reading: '', deltaL: 0 },
    { position: 'Bottom-Right / Back-Right (Pos 4)', reading: '', deltaL: 0 },
    { position: 'Bottom-Left / Back-Left (Pos 5)', reading: '', deltaL: 0 },
  ]);

  // 4. Temperature state (3 temperatures: Reference 20°C, Upper 40°C, Lower 10°C)
  const [temperaturePoints, setTemperaturePoints] = useState([
    { temp: 20, zeroReading: '', spanReading: '' },
    { temp: 40, zeroReading: '', spanReading: '' },
    { temp: 10, zeroReading: '', spanReading: '' },
  ]);

  // 5. Stability & Warm-up state (0, 0.5, 1, 2, 4, 8 hours)
  const [stabilityPoints, setStabilityPoints] = useState([
    { timeHrs: 0, reading: '' },
    { timeHrs: 0.5, reading: '' },
    { timeHrs: 1.0, reading: '' },
    { timeHrs: 2.0, reading: '' },
    { timeHrs: 4.0, reading: '' },
    { timeHrs: 8.0, reading: '' },
  ]);

  // 6. Time Dependence (Creep at 0, 5, 10, 15, 20, 25, 30 min + Zero return)
  const [creepPoints, setCreepPoints] = useState([
    { min: 0, reading: '' },
    { min: 5, reading: '' },
    { min: 10, reading: '' },
    { min: 15, reading: '' },
    { min: 20, reading: '' },
    { min: 25, reading: '' },
    { min: 30, reading: '' },
  ]);
  const [zeroReturnReading, setZeroReturnReading] = useState('');
  const [isBatchCsvModalOpen, setIsBatchCsvModalOpen] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // { type: 'weighing', index: 0, field: 'incReading' }

  // ISO/IEC 17025 / GUM Measurement Uncertainty Evaluation
  const uncertaintyBudget = useMemo(() => {
    const max = Number(instrument.maxCapacity) || 150;
    const e = Number(instrument.verificationScaleInterval_e) || 0.05;
    const d = Number(instrument.actualScaleInterval_d) || e;

    // Type A: Standard uncertainty from repeatability series (standard deviation)
    const readings = repeatabilityFull
      .map((p) => p.reading)
      .filter((v) => v !== '' && !isNaN(Number(v)))
      .map(Number);
    const n = readings.length;
    let u_A = 0;
    if (n > 1) {
      const mean = readings.reduce((a, b) => a + b, 0) / n;
      const variance = readings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1);
      const s = Math.sqrt(variance);
      u_A = roundTo(s / Math.sqrt(n), 6);
    }

    // Type B: Reference standard weights uncertainty (Class F1 / E2 standard)
    const u_weights = roundTo((0.00005 * max) / Math.sqrt(3), 6);
    // Type B: Resolution uncertainty (rectangular distribution: d / (2*sqrt(3)))
    const u_res = roundTo(d / (2 * Math.sqrt(3)), 6);
    // Type B: Eccentricity contribution
    const u_ecc = roundTo((0.0001 * max) / Math.sqrt(3), 6);

    // Combined Standard Uncertainty (uc)
    const u_c = roundTo(Math.sqrt(Math.pow(u_A, 2) + Math.pow(u_weights, 2) + Math.pow(u_res, 2) + Math.pow(u_ecc, 2)), 6);
    // Expanded Uncertainty (U = k * uc with coverage factor k=2 at 95% confidence level)
    const k = 2;
    const U_expanded = roundTo(k * u_c, 5);

    return { u_A, u_weights, u_res, u_ecc, u_c, k, U_expanded };
  }, [repeatabilityFull, instrument]);

  // Initialize test points: load saved session results if available, otherwise start with blank inputs
  useEffect(() => {
    if (!instrument || !instrument.maxCapacity) return;
    const max = Number(instrument.maxCapacity);

    // Look for existing saved test result for this module in session
    const existing = session?.testResults?.find(
      (r) =>
        r.testType === normalizedTestType ||
        (normalizedTestType === 'WEIGHING_PERFORMANCE' && r.testType === 'WEIGHING') ||
        (normalizedTestType === 'TEMPERATURE' && r.testType === 'TEMPERATURE_EFFECTS')
    );

    if (existing && existing.data) {
      const d = existing.data;
      if (d.points && Array.isArray(d.points)) {
        if (d.points[0]?.incReading !== undefined) {
          setWeighingPoints(
            d.points.map((p) => ({
              percent: p.percent ?? p.percentMax,
              load: p.load ?? p.appliedLoad,
              incReading: p.incReading ?? '',
              decReading: p.decReading ?? '',
            }))
          );
        } else {
          const standardPercents = [0, 20, 40, 60, 80, 100];
          setWeighingPoints(
            standardPercents.map((pct) => {
              const load = roundTo(max * (pct / 100), 4);
              const inc = d.points.find((p) => Math.abs(p.appliedLoad - load) < 0.001 && p.isIncreasing !== false);
              const dec = d.points.find((p) => Math.abs(p.appliedLoad - load) < 0.001 && p.isIncreasing === false);
              return {
                percent: pct,
                load,
                incReading: inc?.indicatedValue ?? '',
                decReading: dec?.indicatedValue ?? '',
              };
            })
          );
        }
      }

      if (d.series && Array.isArray(d.series)) {
        const halfSeries = d.series[0]?.readings || [];
        const fullSeries = d.series[1]?.readings || [];
        setRepeatabilityHalf(
          Array.from({ length: 6 }, (_, i) => ({ reading: halfSeries[i] ?? '', deltaL: 0 }))
        );
        setRepeatabilityFull(
          Array.from({ length: 6 }, (_, i) => ({ reading: fullSeries[i] ?? '', deltaL: 0 }))
        );
      }

      if (d.positions && Array.isArray(d.positions)) {
        setEccentricityPoints(
          d.positions.map((p, idx) => ({
            position: p.position === 'CENTER' ? 'Center (Pos 1)' : `Pos ${idx + 1}`,
            reading: p.indicatedValue ?? '',
            deltaL: 0,
          }))
        );
      }

      if (d.temperaturePoints && Array.isArray(d.temperaturePoints)) {
        setTemperaturePoints(
          d.temperaturePoints.map((p) => ({
            temp: p.temperature,
            zeroReading: p.zeroIndication ?? '',
            spanReading: p.spanIndication ?? '',
          }))
        );
      }

      if (d.timePoints && Array.isArray(d.timePoints)) {
        setStabilityPoints(
          d.timePoints.map((p) => ({
            timeHrs: (p.timestampMinutes || 0) / 60,
            reading: p.loadReading ?? '',
          }))
        );
      }

      if (d.creepReadings && Array.isArray(d.creepReadings)) {
        setCreepPoints(
          d.creepReadings.map((p) => ({
            min: p.minute,
            reading: p.indication ?? '',
          }))
        );
        if (d.zeroReturn) {
          setZeroReturnReading(d.zeroReturn.indicationAfterUnload ?? '');
        }
      }
    } else {
      // Default: clean blank inputs for genuine field entry (no synthetic passing pre-fills)
      setWeighingPoints([
        { percent: 0, load: 0, incReading: '', decReading: '' },
        { percent: 20, load: roundTo(max * 0.2, 4), incReading: '', decReading: '' },
        { percent: 40, load: roundTo(max * 0.4, 4), incReading: '', decReading: '' },
        { percent: 60, load: roundTo(max * 0.6, 4), incReading: '', decReading: '' },
        { percent: 80, load: roundTo(max * 0.8, 4), incReading: '', decReading: '' },
        { percent: 100, load: max, incReading: '', decReading: '' },
      ]);
      setRepeatabilityHalf(Array.from({ length: 6 }, () => ({ reading: '', deltaL: 0 })));
      setRepeatabilityFull(Array.from({ length: 6 }, () => ({ reading: '', deltaL: 0 })));
      setEccentricityPoints([
        { position: 'Center (Pos 1)', reading: '', deltaL: 0 },
        { position: 'Top-Left / Front-Left (Pos 2)', reading: '', deltaL: 0 },
        { position: 'Top-Right / Front-Right (Pos 3)', reading: '', deltaL: 0 },
        { position: 'Bottom-Right / Back-Right (Pos 4)', reading: '', deltaL: 0 },
        { position: 'Bottom-Left / Back-Left (Pos 5)', reading: '', deltaL: 0 },
      ]);
      setTemperaturePoints([
        { temp: 20, zeroReading: '', spanReading: '' },
        { temp: 40, zeroReading: '', spanReading: '' },
        { temp: 10, zeroReading: '', spanReading: '' },
      ]);
      setStabilityPoints([
        { timeHrs: 0, reading: '' },
        { timeHrs: 0.5, reading: '' },
        { timeHrs: 1.0, reading: '' },
        { timeHrs: 2.0, reading: '' },
        { timeHrs: 4.0, reading: '' },
        { timeHrs: 8.0, reading: '' },
      ]);
      setCreepPoints([
        { min: 0, reading: '' },
        { min: 5, reading: '' },
        { min: 10, reading: '' },
        { min: 15, reading: '' },
        { min: 20, reading: '' },
        { min: 25, reading: '' },
        { min: 30, reading: '' },
      ]);
      setZeroReturnReading('');
    }
  }, [instrument, session, normalizedTestType]);

  // Module completeness — gates finalization so a module cannot be sealed with
  // blank readings (which would otherwise be coerced into fabricated passes).
  const moduleReadiness = useMemo(
    () =>
      assessModuleCompleteness(normalizedTestType, {
        weighingPoints,
        repeatabilityHalf,
        repeatabilityFull,
        eccentricityPoints,
        temperaturePoints,
        stabilityPoints,
        creepPoints,
        zeroReturnReading,
      }),
    [
      normalizedTestType,
      weighingPoints,
      repeatabilityHalf,
      repeatabilityFull,
      eccentricityPoints,
      temperaturePoints,
      stabilityPoints,
      creepPoints,
      zeroReturnReading,
    ]
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({ isComplete }) => {
      if (isReadOnly) {
        throw new Error('Test session is finalized and sealed in read-only mode.');
      }

      // Never finalize (seal) a module while any required reading is blank.
      if (isComplete && !moduleReadiness.complete) {
        throw new Error(
          `Cannot complete this module: ${moduleReadiness.missing} required reading(s) are still blank. ` +
            `Enter every reading before completing, or use "Save Progress" to store partial data.`
        );
      }

      let payloadData = {};
      if (normalizedTestType === 'WEIGHING_PERFORMANCE' || normalizedTestType === 'WEIGHING') {
        payloadData = {
          points: weighingPoints.flatMap((pt) => [
            { appliedLoad: Number(pt.load), indicatedValue: numOrNull(pt.incReading), isIncreasing: true },
            { appliedLoad: Number(pt.load), indicatedValue: numOrNull(pt.decReading), isIncreasing: false },
          ]),
        };
      } else if (normalizedTestType === 'REPEATABILITY') {
        payloadData = {
          series: [
            {
              load: roundTo(Number(instrument.maxCapacity) * 0.5, 4),
              readings: repeatabilityHalf.map((p) => p.reading).filter(isFilled).map(Number),
            },
            {
              load: Number(instrument.maxCapacity),
              readings: repeatabilityFull.map((p) => p.reading).filter(isFilled).map(Number),
            },
          ],
        };
      } else if (normalizedTestType === 'ECCENTRICITY') {
        const eccLoad = roundTo(Number(instrument.maxCapacity) / 3, 4);
        payloadData = {
          positions: eccentricityPoints.map((pt, idx) => ({
            position: idx === 0 ? 'CENTER' : `POS_${idx + 1}`,
            appliedLoad: eccLoad,
            indicatedValue: numOrNull(pt.reading),
          })),
        };
      } else if (normalizedTestType === 'TEMPERATURE' || normalizedTestType === 'TEMPERATURE_EFFECTS') {
        payloadData = {
          temperaturePoints: temperaturePoints.map((pt) => ({
            temperature: Number(pt.temp),
            zeroIndication: numOrNull(pt.zeroReading),
            spanLoad: Number(instrument.maxCapacity),
            spanIndication: numOrNull(pt.spanReading),
          })),
        };
      } else if (normalizedTestType === 'STABILITY') {
        payloadData = {
          timePoints: stabilityPoints.map((pt) => ({
            timestampMinutes: Number(pt.timeHrs) * 60,
            zeroReading: 0,
            loadReading: numOrNull(pt.reading),
            appliedLoad: Number(instrument.maxCapacity),
          })),
        };
      } else if (normalizedTestType === 'TIME_DEPENDENCE') {
        payloadData = {
          testLoad: Number(instrument.maxCapacity),
          creepReadings: creepPoints.map((pt) => ({
            minute: Number(pt.min),
            indication: numOrNull(pt.reading),
          })),
          zeroReturn: {
            appliedLoad: Number(instrument.maxCapacity),
            indicationAfterUnload: numOrNull(zeroReturnReading),
          },
        };
      }

      const payload = {
        testType: normalizedTestType === 'WEIGHING' ? 'WEIGHING_PERFORMANCE' : normalizedTestType === 'TEMPERATURE_EFFECTS' ? 'TEMPERATURE' : normalizedTestType,
        data: payloadData,
      };

      const res = await apiClient.post(`/tests/${sessionId}/results`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('tests.testSaved', 'Test module data evaluated and saved successfully.'));
      navigate(`/tests/${sessionId}`);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Error saving test data';
      toast.error(msg);
    },
  });

  // -------------------------------------------------------------
  // REAL-TIME COMPUTATIONS FOR EACH TEST TYPE
  // -------------------------------------------------------------

  // 1. Weighing computations
  const weighingCalculations = useMemo(() => {
    return weighingPoints.map((pt) => {
      const mpe = calculateMpe(pt.load, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);
      const hasInc = pt.incReading !== '' && pt.incReading !== null && !isNaN(Number(pt.incReading));
      const hasDec = pt.decReading !== '' && pt.decReading !== null && !isNaN(Number(pt.decReading));

      const incError = hasInc ? roundTo(Number(pt.incReading) - Number(pt.load), 5) : null;
      const decError = hasDec ? roundTo(Number(pt.decReading) - Number(pt.load), 5) : null;
      const incPass = hasInc ? Math.abs(incError) <= mpe : null;
      const decPass = hasDec ? Math.abs(decError) <= mpe : null;
      const isPass = (hasInc && hasDec) ? (incPass && decPass) : (hasInc ? incPass : (hasDec ? decPass : null));

      return {
        ...pt,
        mpe,
        incError,
        decError,
        hasInc,
        hasDec,
        isPass,
      };
    });
  }, [weighingPoints, instrument, isInitial]);

  // 2. Repeatability computations
  const repeatabilityCalculations = useMemo(() => {
    const halfLoad = roundTo(instrument.maxCapacity * 0.5, 4);
    const fullLoad = Number(instrument.maxCapacity);
    const mpeHalf = calculateMpe(halfLoad, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);
    const mpeFull = calculateMpe(fullLoad, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);

    const halfReadings = repeatabilityHalf
      .map((p) => p.reading)
      .filter((v) => v !== '' && !isNaN(Number(v)))
      .map(Number);
    const fullReadings = repeatabilityFull
      .map((p) => p.reading)
      .filter((v) => v !== '' && !isNaN(Number(v)))
      .map(Number);

    const halfRange = halfReadings.length >= 2 ? roundTo(Math.max(...halfReadings) - Math.min(...halfReadings), 5) : null;
    const fullRange = fullReadings.length >= 2 ? roundTo(Math.max(...fullReadings) - Math.min(...fullReadings), 5) : null;

    return {
      halfLoad,
      fullLoad,
      mpeHalf,
      mpeFull,
      halfRange,
      fullRange,
      halfPass: halfRange !== null ? halfRange <= mpeHalf : null,
      fullPass: fullRange !== null ? fullRange <= mpeFull : null,
    };
  }, [repeatabilityHalf, repeatabilityFull, instrument, isInitial]);

  // 3. Eccentricity computations
  const eccentricityCalculations = useMemo(() => {
    const testLoad = roundTo(instrument.maxCapacity / 3, 4);
    const mpe = calculateMpe(testLoad, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);
    const centerVal = eccentricityPoints[0]?.reading;
    const hasCenter = centerVal !== '' && !isNaN(Number(centerVal));
    const centerReading = hasCenter ? Number(centerVal) : null;

    const evaluated = eccentricityPoints.map((pt) => {
      const hasVal = pt.reading !== '' && !isNaN(Number(pt.reading));
      const read = hasVal ? Number(pt.reading) : null;
      const diffFromCenter = (read !== null && centerReading !== null) ? roundTo(read - centerReading, 5) : null;
      const isPass = diffFromCenter !== null ? Math.abs(diffFromCenter) <= mpe : null;
      return { ...pt, diffFromCenter, mpe, isPass };
    });

    const anyEvaluated = evaluated.some((p) => p.isPass !== null);
    const overallPass = anyEvaluated ? evaluated.every((p) => p.isPass === true) : null;
    return { testLoad, mpe, evaluated, overallPass };
  }, [eccentricityPoints, instrument, isInitial]);

  // 4. Temperature computations
  const temperatureCalculations = useMemo(() => {
    const max = Number(instrument.maxCapacity);
    const mpe = calculateMpe(max, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);
    const evaluated = temperaturePoints.map((pt) => {
      const hasSpan = pt.spanReading !== '' && !isNaN(Number(pt.spanReading));
      const hasZero = pt.zeroReading !== '' && !isNaN(Number(pt.zeroReading));
      const spanErr = hasSpan ? roundTo(Number(pt.spanReading) - max, 5) : null;
      const zeroErr = hasZero ? roundTo(Number(pt.zeroReading), 5) : null;
      const isPass = (hasSpan && hasZero)
        ? (Math.abs(spanErr) <= mpe && Math.abs(zeroErr) <= Number(instrument.verificationScaleInterval_e))
        : null;
      return { ...pt, spanErr, zeroErr, mpe, isPass };
    });
    const anyEvaluated = evaluated.some((p) => p.isPass !== null);
    const overallPass = anyEvaluated ? evaluated.every((p) => p.isPass === true) : null;
    return { evaluated, overallPass };
  }, [temperaturePoints, instrument, isInitial]);

  // 5. Stability computations
  const stabilityCalculations = useMemo(() => {
    const max = Number(instrument.maxCapacity);
    const mpe = calculateMpe(max, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);
    const baseVal = stabilityPoints[0]?.reading;
    const hasBase = baseVal !== '' && !isNaN(Number(baseVal));
    const baseReading = hasBase ? Number(baseVal) : null;

    const evaluated = stabilityPoints.map((pt) => {
      const hasVal = pt.reading !== '' && !isNaN(Number(pt.reading));
      const read = hasVal ? Number(pt.reading) : null;
      const drift = (read !== null && baseReading !== null) ? roundTo(read - baseReading, 5) : null;
      const isPass = drift !== null ? Math.abs(drift) <= mpe : null;
      return { ...pt, drift, mpe, isPass };
    });
    const anyEvaluated = evaluated.some((p) => p.isPass !== null);
    const overallPass = anyEvaluated ? evaluated.every((p) => p.isPass === true) : null;
    return { evaluated, overallPass };
  }, [stabilityPoints, instrument, isInitial]);

  // 6. Time Dependence (Creep) computations
  const creepCalculations = useMemo(() => {
    const max = Number(instrument.maxCapacity);
    const mpe = calculateMpe(max, instrument.verificationScaleInterval_e, instrument.accuracyClass, isInitial);
    const pt15 = creepPoints.find((p) => p.min === 15);
    const pt30 = creepPoints.find((p) => p.min === 30);
    const has15 = pt15 && pt15.reading !== '' && !isNaN(Number(pt15.reading));
    const has30 = pt30 && pt30.reading !== '' && !isNaN(Number(pt30.reading));
    const creepDelta = (has15 && has30) ? roundTo(Math.abs(Number(pt30.reading) - Number(pt15.reading)), 5) : null;
    const creepLimit = roundTo(0.2 * mpe, 5);
    const creepPass = creepDelta !== null ? creepDelta <= creepLimit : null;

    const hasZeroReturn = zeroReturnReading !== '' && !isNaN(Number(zeroReturnReading));
    const zeroReturnErr = hasZeroReturn ? roundTo(Math.abs(Number(zeroReturnReading)), 5) : null;
    const zeroLimit = roundTo(0.5 * Number(instrument.verificationScaleInterval_e), 5);
    const zeroPass = zeroReturnErr !== null ? zeroReturnErr <= zeroLimit : null;

    const overallPass = (creepPass !== null && zeroPass !== null) ? (creepPass && zeroPass) : null;

    return {
      creepDelta,
      creepLimit,
      creepPass,
      zeroReturnErr,
      zeroLimit,
      zeroPass,
      overallPass,
    };
  }, [creepPoints, zeroReturnReading, instrument, isInitial]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12">
        <LoadingSpinner message="Loading verification parameters..." />
      </div>
    );
  }

  // Titles mapping
  const titleMap = {
    WEIGHING_PERFORMANCE: t('testTypes.weighingPerformance', 'Weighing Performance Test'),
    WEIGHING: t('testTypes.weighingPerformance', 'Weighing Performance Test'),
    REPEATABILITY: t('testTypes.repeatability', 'Repeatability Test'),
    ECCENTRICITY: t('testTypes.eccentricity', 'Eccentricity (Off-Center) Test'),
    TEMPERATURE: t('testTypes.temperature', 'Temperature Effects Test'),
    TEMPERATURE_EFFECTS: t('testTypes.temperature', 'Temperature Effects Test'),
    STABILITY: t('testTypes.stability', 'Stability & Warm-up Test'),
    TIME_DEPENDENCE: t('testTypes.timeDependence', 'Time Dependence (Creep) Test'),
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={titleMap[normalizedTestType] || 'Test Data Entry'}
        subtitle={`Session: ${session?.certificateNumber} | Instrument: ${instrument.model} (${instrument.accuracyClass}, Max: ${instrument.maxCapacity} ${instrument.unit})`}
        actions={
          <button
            type="button"
            onClick={() => navigate(`/tests/${sessionId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 transition-colors"
          >
            <FiArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Session</span>
          </button>
        }
      />

      {/* Official Legal Status Banner when Session is Completed */}
      {isReadOnly && (
        <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-600 text-white rounded-full shrink-0 shadow-xs">
              <FiLock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950 uppercase tracking-wide flex items-center gap-2">
                <span>COMPLETED &amp; SEALED — READ ONLY</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-200 text-amber-900 border border-amber-400 rounded">
                  LEGAL SEAL ACTIVE
                </span>
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                This verification session has been finalized, digitally signed with an HMAC-SHA256 seal, and archived. All test measurements and metrological calculations are permanently locked against modification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/reports/${sessionId}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1e3a5f] hover:bg-[#152a45] rounded shadow-xs transition-colors shrink-0"
          >
            <span>View Certificate &amp; Seal →</span>
          </button>
        </div>
      )}

      {/* Metrological Reference Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary-50 text-primary-700 rounded">
            <FiLayers className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900">
              {instrument.model} (S/N: {instrument.serialNumber || 'N/A'})
            </div>
            <div className="text-slate-500 font-mono text-[11px]">
              Accuracy: {instrument.accuracyClass} | Max: {instrument.maxCapacity} {instrument.unit} | e: {instrument.verificationScaleInterval_e ?? instrument.verificationInterval} {instrument.unit}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Verification Mode</span>
            <span className="font-bold text-slate-800">
              {isInitial ? 'Initial (1x MPE)' : 'In-Service (2x MPE)'}
            </span>
          </div>
        </div>
      </div>

      {/* RS-232 / USB Serial Telemetry Digital Indicator Toolbar */}
      <SerialTelemetryToolbar
        instrument={instrument}
        onCaptureReading={(captured) => {
          if (isReadOnly) return;
          if (focusedField) {
            if (focusedField.type === 'weighing') {
              setWeighingPoints((prev) =>
                prev.map((p, i) => (i === focusedField.index ? { ...p, [focusedField.field]: captured.weight } : p))
              );
            } else if (focusedField.type === 'repeatabilityHalf') {
              setRepeatabilityHalf((prev) =>
                prev.map((p, i) => (i === focusedField.index ? { ...p, reading: captured.weight } : p))
              );
            } else if (focusedField.type === 'repeatabilityFull') {
              setRepeatabilityFull((prev) =>
                prev.map((p, i) => (i === focusedField.index ? { ...p, reading: captured.weight } : p))
              );
            } else if (focusedField.type === 'eccentricity') {
              setEccentricityPoints((prev) =>
                prev.map((p, i) => (i === focusedField.index ? { ...p, reading: captured.weight } : p))
              );
            }
          } else {
            // Default: capture into first row of active test
            if ((normalizedTestType === 'WEIGHING_PERFORMANCE' || normalizedTestType === 'WEIGHING') && weighingPoints.length > 0) {
              setWeighingPoints((prev) => {
                const next = [...prev];
                next[0] = { ...next[0], incReading: captured.weight };
                return next;
              });
            }
          }
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* 1. WEIGHING PERFORMANCE FORM */}
      {/* ------------------------------------------------------------- */}
      {(normalizedTestType === 'WEIGHING_PERFORMANCE' || normalizedTestType === 'WEIGHING') && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Increasing & Decreasing Load Verification Table
              </h2>
              <p className="text-xs text-slate-500">
                OIML R-76 §A.4.4. Verify errors across range within Maximum Permissible Error (MPE) envelope.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => !isReadOnly && setIsBatchCsvModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-bold border rounded-lg text-xs transition-colors shadow-sm ${
                  isReadOnly
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                }`}
              >
                <FiUploadCloud className="w-3.5 h-3.5" />
                <span>Batch CSV Weighbridge Import</span>
              </button>
            </div>
          </div>

          {/* Interactive OIML R-76 Error Curve & Tolerance Envelope */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                OIML R-76 Linearity Deviation Curve vs MPE Tolerance Envelope
              </span>
              <span className="text-[11px] text-slate-500">
                Green points = Within Spec (Compliant) | Red = Out of Tolerance
              </span>
            </div>

            {/* SVG Visual Tolerance Envelope */}
            <div className="h-36 w-full bg-white border border-slate-200 rounded p-2 relative overflow-hidden flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 500 100" preserveAspectRatio="none">
                {/* Zero Error Axis */}
                <line x1="0" y1="50" x2="500" y2="50" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1" />
                {/* Upper MPE Limit (+1.0e step) */}
                <path d="M 0 30 L 150 30 L 150 20 L 350 20 L 350 10 L 500 10" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 3" />
                {/* Lower MPE Limit (-1.0e step) */}
                <path d="M 0 70 L 150 70 L 150 80 L 350 80 L 350 90 L 500 90" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 3" />
                {/* Compliant Error Curve Data Line */}
                {weighingCalculations.some((p) => p.hasInc) && (
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    points={weighingCalculations
                      .map((pt, i) => {
                        if (!pt.hasInc) return null;
                        const x = (i / Math.max(1, weighingCalculations.length - 1)) * 480 + 10;
                        const y = 50 - (pt.incError / Math.max(0.001, pt.mpe * 2)) * 35;
                        return `${x},${Math.max(10, Math.min(90, y))}`;
                      })
                      .filter(Boolean)
                      .join(' ')}
                  />
                )}
                {/* Calculated Points */}
                {weighingCalculations.map((pt, i) => {
                  if (!pt.hasInc) return null;
                  const x = (i / Math.max(1, weighingCalculations.length - 1)) * 480 + 10;
                  const y = 50 - (pt.incError / Math.max(0.001, pt.mpe * 2)) * 35;
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={Math.max(10, Math.min(90, y))}
                      r="4"
                      fill={pt.isPass ? '#16a34a' : '#dc2626'}
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </svg>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
              <span>0% Max</span>
              <span>20% Max</span>
              <span>40% Max</span>
              <span>60% Max</span>
              <span>80% Max</span>
              <span>100% Max</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-y border-slate-200 uppercase font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Load Point (%)</th>
                  <th className="px-3 py-2.5">Applied Load (L) [{instrument.unit}]</th>
                  <th className="px-3 py-2.5">Indicated Inc. (I_inc)</th>
                  <th className="px-3 py-2.5">Error Inc. (E_inc)</th>
                  <th className="px-3 py-2.5">Indicated Dec. (I_dec)</th>
                  <th className="px-3 py-2.5">Error Dec. (E_dec)</th>
                  <th className="px-3 py-2.5">MPE (±)</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {weighingCalculations.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-sans font-semibold text-slate-800">
                      {row.percent}% Max
                    </td>
                    <td className="px-3 py-2.5 font-bold">{row.load}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="any"
                        disabled={isReadOnly}
                        value={row.incReading}
                        placeholder={isReadOnly ? '-' : '0.00'}
                        onFocus={() => setFocusedField({ type: 'weighing', index: idx, field: 'incReading' })}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          const val = e.target.value;
                          setWeighingPoints((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, incReading: val } : p))
                          );
                        }}
                        className={`w-24 px-2 py-1 border rounded font-bold ${
                          isReadOnly
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                            : 'bg-white border-slate-300 focus:ring-1 focus:ring-primary-500'
                        }`}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 font-bold ${
                        row.incError === null
                          ? 'text-slate-400'
                          : Math.abs(row.incError) <= row.mpe
                          ? 'text-green-700'
                          : 'text-red-600'
                      }`}
                    >
                      {row.incError === null ? '-' : row.incError > 0 ? `+${row.incError}` : row.incError}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="any"
                        disabled={isReadOnly}
                        value={row.decReading}
                        placeholder={isReadOnly ? '-' : '0.00'}
                        onFocus={() => setFocusedField({ type: 'weighing', index: idx, field: 'decReading' })}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          const val = e.target.value;
                          setWeighingPoints((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, decReading: val } : p))
                          );
                        }}
                        className={`w-24 px-2 py-1 border rounded font-bold ${
                          isReadOnly
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                            : 'bg-white border-slate-300 focus:ring-1 focus:ring-primary-500'
                        }`}
                      />
                    </td>
                    <td
                      className={`px-3 py-2.5 font-bold ${
                        row.decError === null
                          ? 'text-slate-400'
                          : Math.abs(row.decError) <= row.mpe
                          ? 'text-green-700'
                          : 'text-red-600'
                      }`}
                    >
                      {row.decError === null ? '-' : row.decError > 0 ? `+${row.decError}` : row.decError}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">±{row.mpe}</td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      <StatusBadge
                        status={
                          row.isPass === true
                            ? 'PASS'
                            : row.isPass === false
                            ? 'FAIL'
                            : 'PENDING'
                        }
                        size="xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. REPEATABILITY FORM */}
      {/* ------------------------------------------------------------- */}
      {normalizedTestType === 'REPEATABILITY' && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Repeatability Verification (OIML R-76 §A.4.10)
            </h2>
            <p className="text-xs text-slate-500">
              Conduct at least 6 successive loadings at 50% and 100% of Max capacity. Maximum difference ΔP must not exceed |MPE|.
            </p>
          </div>

          {/* 50% Max Load Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Series 1: 50% Max Load ({repeatabilityCalculations.halfLoad} {instrument.unit}) — MPE: ±{repeatabilityCalculations.mpeHalf}
              </h3>
              <StatusBadge
                status={
                  repeatabilityCalculations.halfPass === true
                    ? 'PASS'
                    : repeatabilityCalculations.halfPass === false
                    ? 'FAIL'
                    : 'PENDING'
                }
                size="xs"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {repeatabilityHalf.map((item, idx) => (
                <div key={idx}>
                  <label className="text-[10px] text-slate-500 block">Run #{idx + 1}</label>
                  <input
                    type="number"
                    step="any"
                    disabled={isReadOnly}
                    value={item.reading}
                    placeholder={isReadOnly ? '-' : '0.00'}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const val = e.target.value;
                      setRepeatabilityHalf((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, reading: val } : p))
                      );
                    }}
                    className={`w-full px-2 py-1 text-xs border rounded font-mono font-bold ${
                      isReadOnly
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                </div>
              ))}
            </div>

            <div className="text-xs flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-600">
                Max Difference (ΔP):{' '}
                <strong className="font-mono">
                  {repeatabilityCalculations.halfRange === null ? '-' : `${repeatabilityCalculations.halfRange} ${instrument.unit}`}
                </strong>
              </span>
              <span className="text-slate-500">Tolerance Limit: ≤ {repeatabilityCalculations.mpeHalf} {instrument.unit}</span>
            </div>
          </div>

          {/* 100% Max Load Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Series 2: 100% Max Load ({repeatabilityCalculations.fullLoad} {instrument.unit}) — MPE: ±{repeatabilityCalculations.mpeFull}
              </h3>
              <StatusBadge
                status={
                  repeatabilityCalculations.fullPass === true
                    ? 'PASS'
                    : repeatabilityCalculations.fullPass === false
                    ? 'FAIL'
                    : 'PENDING'
                }
                size="xs"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {repeatabilityFull.map((item, idx) => (
                <div key={idx}>
                  <label className="text-[10px] text-slate-500 block">Run #{idx + 1}</label>
                  <input
                    type="number"
                    step="any"
                    disabled={isReadOnly}
                    value={item.reading}
                    placeholder={isReadOnly ? '-' : '0.00'}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const val = e.target.value;
                      setRepeatabilityFull((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, reading: val } : p))
                      );
                    }}
                    className={`w-full px-2 py-1 text-xs border rounded font-mono font-bold ${
                      isReadOnly
                        ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                        : 'bg-white border-slate-300'
                    }`}
                  />
                </div>
              ))}
            </div>

            <div className="text-xs flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-600">
                Max Difference (ΔP):{' '}
                <strong className="font-mono">
                  {repeatabilityCalculations.fullRange === null ? '-' : `${repeatabilityCalculations.fullRange} ${instrument.unit}`}
                </strong>
              </span>
              <span className="text-slate-500">Tolerance Limit: ≤ {repeatabilityCalculations.mpeFull} {instrument.unit}</span>
            </div>
          </div>

          {/* ISO/IEC 17025 / NABL Measurement Uncertainty Budget Card */}
          <div className="p-4 bg-slate-900 text-white rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-cyan-300">
                  ISO/IEC 17025 Measurement Uncertainty Evaluation (GUM)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-700 text-[10px] font-mono">
                Coverage Factor k=2 (95% Confidence)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
              <div className="p-2 bg-slate-800/80 rounded border border-slate-700">
                <span className="text-slate-400 block text-[10px]">Type A (Repeatability uA)</span>
                <span className="font-bold text-white text-xs">{uncertaintyBudget.u_A} {instrument.unit}</span>
              </div>
              <div className="p-2 bg-slate-800/80 rounded border border-slate-700">
                <span className="text-slate-400 block text-[10px]">Type B (Standard Weights uW)</span>
                <span className="font-bold text-white text-xs">{uncertaintyBudget.u_weights} {instrument.unit}</span>
              </div>
              <div className="p-2 bg-slate-800/80 rounded border border-slate-700">
                <span className="text-slate-400 block text-[10px]">Combined Standard (uc)</span>
                <span className="font-bold text-white text-xs">{uncertaintyBudget.u_c} {instrument.unit}</span>
              </div>
              <div className="p-2 bg-cyan-950/80 rounded border border-cyan-500">
                <span className="text-cyan-300 block text-[10px]">Expanded Uncertainty (U)</span>
                <span className="font-bold text-cyan-400 text-xs">±{uncertaintyBudget.U_expanded} {instrument.unit}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. ECCENTRICITY FORM */}
      {/* ------------------------------------------------------------- */}
      {normalizedTestType === 'ECCENTRICITY' && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Eccentricity (Off-Center Loading) Verification (OIML R-76 §A.4.7)
              </h2>
              <p className="text-xs text-slate-500">
                Applied Load: 1/3 Max = {eccentricityCalculations.testLoad} {instrument.unit} | MPE: ±{eccentricityCalculations.mpe} {instrument.unit}
              </p>
            </div>
            <StatusBadge
              status={
                eccentricityCalculations.overallPass === true
                  ? 'PASS'
                  : eccentricityCalculations.overallPass === false
                  ? 'FAIL'
                  : 'PENDING'
              }
              size="sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Visual Platform Diagram Placeholder */}
            <div className="border border-slate-200 bg-slate-50 p-4 rounded-lg flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">
                Platform Loading Diagram (5 Positions)
              </span>
              <div className="relative w-48 h-48 bg-white border-2 border-slate-300 rounded-lg shadow-inner flex items-center justify-center">
                <span className="absolute top-2 left-2 text-[10px] font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-200">
                  Pos 2 (TL)
                </span>
                <span className="absolute top-2 right-2 text-[10px] font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-200">
                  Pos 3 (TR)
                </span>
                <span className="text-xs font-bold text-white bg-primary-600 px-2.5 py-1 rounded-full shadow-sm">
                  Pos 1 (Center)
                </span>
                <span className="absolute bottom-2 left-2 text-[10px] font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-200">
                  Pos 5 (BL)
                </span>
                <span className="absolute bottom-2 right-2 text-[10px] font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-200">
                  Pos 4 (BR)
                </span>
              </div>
            </div>

            {/* Position Inputs Table */}
            <div className="space-y-3">
              {eccentricityCalculations.evaluated.map((pt, idx) => (
                <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800 block">{pt.position}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Diff from Center:{' '}
                      {pt.diffFromCenter === null
                        ? '-'
                        : `${pt.diffFromCenter > 0 ? `+${pt.diffFromCenter}` : pt.diffFromCenter} ${instrument.unit}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="any"
                      disabled={isReadOnly}
                      value={pt.reading}
                      placeholder={isReadOnly ? '-' : '0.00'}
                      onChange={(e) => {
                        if (isReadOnly) return;
                        const val = e.target.value;
                        setEccentricityPoints((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, reading: val } : p))
                        );
                      }}
                      className={`w-24 px-2 py-1 border rounded font-mono font-bold ${
                        isReadOnly
                          ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                          : 'bg-white border-slate-300'
                      }`}
                    />
                    <StatusBadge
                      status={
                        pt.isPass === true
                          ? 'PASS'
                          : pt.isPass === false
                          ? 'FAIL'
                          : 'PENDING'
                      }
                      size="xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. TEMPERATURE FORM */}
      {/* ------------------------------------------------------------- */}
      {(normalizedTestType === 'TEMPERATURE' || normalizedTestType === 'TEMPERATURE_EFFECTS') && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Temperature Effects & Zero Drift Verification (OIML R-76 §A.5.3)
              </h2>
              <p className="text-xs text-slate-500">
                Tested across operating temperatures. Zero drift must not exceed 1e per 5°C change.
              </p>
            </div>
            <StatusBadge
              status={
                temperatureCalculations.overallPass === true
                  ? 'PASS'
                  : temperatureCalculations.overallPass === false
                  ? 'FAIL'
                  : 'PENDING'
              }
              size="sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-y border-slate-200 uppercase font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Temperature (°C)</th>
                  <th className="px-3 py-2.5">Zero Reading</th>
                  <th className="px-3 py-2.5">Zero Error</th>
                  <th className="px-3 py-2.5">Span Reading (Max)</th>
                  <th className="px-3 py-2.5">Span Error</th>
                  <th className="px-3 py-2.5">MPE (±)</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {temperatureCalculations.evaluated.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-bold font-sans">{row.temp}°C</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="any"
                        disabled={isReadOnly}
                        value={row.zeroReading}
                        placeholder={isReadOnly ? '-' : '0.00'}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          const val = e.target.value;
                          setTemperaturePoints((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, zeroReading: val } : p))
                          );
                        }}
                        className={`w-20 px-2 py-1 border rounded font-mono font-bold ${
                          isReadOnly
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                            : 'bg-white border-slate-300'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">
                      {row.zeroErr === null ? '-' : `${row.zeroErr > 0 ? `+${row.zeroErr}` : row.zeroErr} ${instrument.unit}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="any"
                        disabled={isReadOnly}
                        value={row.spanReading}
                        placeholder={isReadOnly ? '-' : '0.00'}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          const val = e.target.value;
                          setTemperaturePoints((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, spanReading: val } : p))
                          );
                        }}
                        className={`w-24 px-2 py-1 border rounded font-mono font-bold ${
                          isReadOnly
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                            : 'bg-white border-slate-300'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">
                      {row.spanErr === null ? '-' : `${row.spanErr > 0 ? `+${row.spanErr}` : row.spanErr} ${instrument.unit}`}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">±{row.mpe}</td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      <StatusBadge
                        status={
                          row.isPass === true
                            ? 'PASS'
                            : row.isPass === false
                            ? 'FAIL'
                            : 'PENDING'
                        }
                        size="xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. STABILITY & WARM-UP FORM */}
      {/* ------------------------------------------------------------- */}
      {normalizedTestType === 'STABILITY' && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Stability & Warm-up Verification (OIML R-76 §A.4.11)
              </h2>
              <p className="text-xs text-slate-500">
                Span stability under sustained continuous load over an 8-hour period.
              </p>
            </div>
            <StatusBadge
              status={
                stabilityCalculations.overallPass === true
                  ? 'PASS'
                  : stabilityCalculations.overallPass === false
                  ? 'FAIL'
                  : 'PENDING'
              }
              size="sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-y border-slate-200 uppercase font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Time Elapsed (Hours)</th>
                  <th className="px-3 py-2.5">Observed Reading [{instrument.unit}]</th>
                  <th className="px-3 py-2.5">Drift from Initial</th>
                  <th className="px-3 py-2.5">MPE (±)</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {stabilityCalculations.evaluated.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-bold font-sans">{row.timeHrs} hrs</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="any"
                        disabled={isReadOnly}
                        value={row.reading}
                        placeholder={isReadOnly ? '-' : '0.00'}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          const val = e.target.value;
                          setStabilityPoints((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, reading: val } : p))
                          );
                        }}
                        className={`w-28 px-2 py-1 border rounded font-mono font-bold ${
                          isReadOnly
                            ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                            : 'bg-white border-slate-300'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">
                      {row.drift === null ? '-' : `${row.drift > 0 ? `+${row.drift}` : row.drift} ${instrument.unit}`}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">±{row.mpe}</td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      <StatusBadge
                        status={
                          row.isPass === true
                            ? 'PASS'
                            : row.isPass === false
                            ? 'FAIL'
                            : 'PENDING'
                        }
                        size="xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. TIME DEPENDENCE (CREEP) FORM */}
      {/* ------------------------------------------------------------- */}
      {normalizedTestType === 'TIME_DEPENDENCE' && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Time Dependence (Creep & Zero Return) Verification (OIML R-76 §A.4.8)
              </h2>
              <p className="text-xs text-slate-500">
                Evaluate creep under Max load for 30 min and zero return reading within 0.5e after load removal.
              </p>
            </div>
            <StatusBadge
              status={
                creepCalculations.overallPass === true
                  ? 'PASS'
                  : creepCalculations.overallPass === false
                  ? 'FAIL'
                  : 'PENDING'
              }
              size="sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Creep Table */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">Creep Test (Max Load)</h3>
                <StatusBadge
                  status={
                    creepCalculations.creepPass === true
                      ? 'PASS'
                      : creepCalculations.creepPass === false
                      ? 'FAIL'
                      : 'PENDING'
                  }
                  size="xs"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {creepPoints.map((item, idx) => (
                  <div key={idx}>
                    <label className="text-[10px] text-slate-500 block">{item.min} min</label>
                    <input
                      type="number"
                      step="any"
                      disabled={isReadOnly}
                      value={item.reading}
                      placeholder={isReadOnly ? '-' : '0.00'}
                      onChange={(e) => {
                        if (isReadOnly) return;
                        const val = e.target.value;
                        setCreepPoints((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, reading: val } : p))
                        );
                      }}
                      className={`w-full px-2 py-1 text-xs border rounded font-mono font-bold ${
                        isReadOnly
                          ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                          : 'bg-white border-slate-300'
                      }`}
                    />
                  </div>
                ))}
              </div>

              <div className="text-xs pt-2 border-t border-slate-200 text-slate-600">
                Δ(15m to 30m): <strong className="font-mono">{creepCalculations.creepDelta === null ? '-' : `${creepCalculations.creepDelta} ${instrument.unit}`}</strong> | Tolerance Limit: ≤ {creepCalculations.creepLimit} {instrument.unit} (0.2|MPE|)
              </div>
            </div>

            {/* Zero Return Section */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900">Zero Return Error</h3>
                  <StatusBadge
                    status={
                      creepCalculations.zeroPass === true
                        ? 'PASS'
                        : creepCalculations.zeroPass === false
                        ? 'FAIL'
                        : 'PENDING'
                    }
                    size="xs"
                  />
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Reading observed immediately after full load removal.
                </p>

                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Zero Return Indication [{instrument.unit}]
                </label>
                <input
                  type="number"
                  step="any"
                  disabled={isReadOnly}
                  value={zeroReturnReading}
                  placeholder={isReadOnly ? '-' : '0.00'}
                  onChange={(e) => {
                    if (isReadOnly) return;
                    setZeroReturnReading(e.target.value);
                  }}
                  className={`w-full px-3 py-2 text-xs border rounded font-mono font-bold ${
                    isReadOnly
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                      : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              <div className="text-xs pt-2 border-t border-slate-200 text-slate-600">
                Zero Error: <strong className="font-mono">{creepCalculations.zeroReturnErr === null ? '-' : `${creepCalculations.zeroReturnErr} ${instrument.unit}`}</strong> | Limit: ≤ {creepCalculations.zeroLimit} {instrument.unit} (0.5e)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save & Complete Action Bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <FiInfo className="w-4 h-4 text-primary-600" />
          <span>Real-time mathematical validation active per OIML R-76 rules.</span>
        </div>

        {isReadOnly ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-md">
              <FiLock className="w-3.5 h-3.5" />
              Session Finalized & Sealed
            </span>
            <button
              type="button"
              onClick={() => navigate(`/reports/${sessionId}`)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors shadow-sm"
            >
              <span>View Certificate & Report &rarr;</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            {!moduleReadiness.complete && (
              <span className="text-[11px] font-semibold text-amber-700">
                {moduleReadiness.missing} reading(s) blank — enter all to complete
              </span>
            )}
            <button
              type="button"
              onClick={() => saveMutation.mutate({ isComplete: false })}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <FiSave className="w-3.5 h-3.5" />
              <span>{t('common.save', 'Save Progress')}</span>
            </button>

            <button
              type="button"
              onClick={() => saveMutation.mutate({ isComplete: true })}
              disabled={saveMutation.isPending || !moduleReadiness.complete}
              title={
                moduleReadiness.complete
                  ? 'Evaluate and seal this module'
                  : `Cannot complete: ${moduleReadiness.missing} required reading(s) still blank`
              }
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiCheckCircle className="w-3.5 h-3.5" />
              <span>{t('common.saveAndComplete', 'Save & Complete Module')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Batch CSV Import Modal */}
      <BatchCsvModal
        isOpen={isBatchCsvModalOpen}
        onClose={() => setIsBatchCsvModalOpen(false)}
        sessionId={sessionId}
        instrument={instrument}
        onImportSuccess={(parsedData) => {
          if (parsedData && parsedData.points) {
            const imported = parsedData.points.map((pt) => ({
              percent: pt.percentMax,
              load: pt.appliedLoad,
              incReading: pt.incReading,
              decReading: pt.decReading,
            }));
            setWeighingPoints(imported);
            toast.success(`Populated ${imported.length} weighbridge calibration points.`);
          }
        }}
      />
    </div>
  );
}
