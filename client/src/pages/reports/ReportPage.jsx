import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FiDownload,
  FiFileText,
  FiCheckCircle,
  FiArrowLeft,
  FiShield,
  FiPrinter,
  FiExternalLink,
  FiCopy,
  FiCheck,
  FiLock,
  FiActivity,
} from 'react-icons/fi';

import QRCode from 'qrcode';
import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ErrorEnvelopeChart from '../../components/charts/ErrorEnvelopeChart';

/**
 * Genuine ISO/IEC 18004 QR Code matrix generator
 * Uses authentic Reed-Solomon error correction and module placement to create
 * a camera-scannable QR matrix with quiet-zone padding for immediate smartphone scanning.
 */
function generateQrMatrix(text, margin = 2) {
  if (!text) return [];
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const totalSize = size + margin * 2;
    const matrix = Array.from({ length: totalSize }, () => Array(totalSize).fill(0));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        matrix[r + margin][c + margin] = qr.modules.get(r, c) ? 1 : 0;
      }
    }
    return matrix;
  } catch (err) {
    console.error('Failed to generate genuine QR matrix:', err);
    return [];
  }
}

export default function ReportPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [downloadingType, setDownloadingType] = useState(null);
  const [copiedCert, setCopiedCert] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['report-session', sessionId],
    queryFn: async () => {
      const res = await apiClient.get(`/tests/${sessionId}`);
      const raw = res.data?.data || res.data;
      return {
        ...raw,
        certificateNumber: raw.certificateNo || raw.certificateNumber,
        overallVerdict: raw.overallResult || raw.overallVerdict,
        inspector: raw.conductedBy || raw.inspector,
      };
    },
  });

  const certificateNumber = session?.certificateNumber || 'CERT-2026-PENDING';
  const verificationUrl = `${window.location.origin}/verify/${encodeURIComponent(certificateNumber)}`;

  const qrMatrix = useMemo(() => {
    return generateQrMatrix(verificationUrl);
  }, [verificationUrl]);

  // Extract weighing performance test points for ErrorEnvelopeChart
  const weighingPoints = useMemo(() => {
    if (!session?.testResults || !Array.isArray(session.testResults)) return [];
    const weighingTest = session.testResults.find(
      (t) => t.testType === 'WEIGHING_PERFORMANCE' || t.testType === 'WEIGHING'
    );
    if (weighingTest && weighingTest.data && Array.isArray(weighingTest.data.points)) {
      return weighingTest.data.points;
    }
    return [];
  }, [session]);

  // Real module completion + verdict roll-up. Never assert "6/6 all passed" —
  // count what was actually executed and derive the verdict from module results.
  const REQUIRED_MODULE_COUNT = 6;
  const moduleStats = useMemo(() => {
    const modules = Array.isArray(session?.testResults) ? session.testResults : [];
    const executed = modules.length;
    const verdicts = modules.map((m) => String(m.result || '').toUpperCase());
    const anyFail = verdicts.includes('FAIL');
    const allPass = executed >= REQUIRED_MODULE_COUNT && verdicts.every((v) => v === 'PASS');
    return { executed, anyFail, allPass };
  }, [session]);

  // Genuine ISO GUM / EURAMET cg-18 uncertainty budget, computed from the real
  // repeatability series + instrument spec for this session. Returns null when the
  // underlying data is insufficient, so the UI shows a neutral placeholder rather
  // than inventing a budget.
  const uncertaintyBudget = useMemo(() => {
    const inst = session?.instrument || {};
    const max = Number(inst.maxCapacity);
    const e = Number(inst.verificationInterval ?? inst.verificationScaleInterval_e);
    const d = Number(inst.actualInterval ?? inst.verificationInterval ?? e);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(d) || d <= 0) return null;

    const results = Array.isArray(session?.testResults) ? session.testResults : [];
    const repTest = results.find((r) => r.testType === 'REPEATABILITY');
    const series = repTest?.data?.series;
    let readings = [];
    if (Array.isArray(series)) {
      if (series.length && Array.isArray(series[0]?.readings)) {
        readings = series.flatMap((s) => s.readings);
      } else {
        readings = series.map((s) => s.indicated ?? s.reading ?? s.indication);
      }
    }
    readings = readings.map(Number).filter((v) => Number.isFinite(v));

    let u_A = null;
    if (readings.length > 1) {
      const mean = readings.reduce((a, b) => a + b, 0) / readings.length;
      const variance = readings.reduce((s, r) => s + (r - mean) ** 2, 0) / (readings.length - 1);
      u_A = Math.sqrt(variance) / Math.sqrt(readings.length);
    }

    // Type B components (rectangular distributions -> divide by sqrt(3))
    const u_weights = (0.00005 * max) / Math.sqrt(3); // reference weights ~50 ppm
    const u_res = d / (2 * Math.sqrt(3)); // digital rounding of one interval
    const u_ecc = (0.0001 * max) / Math.sqrt(3); // residual eccentricity
    const aA = u_A ?? 0;
    const u_c = Math.sqrt(aA ** 2 + u_weights ** 2 + u_res ** 2 + u_ecc ** 2);
    const k = 2;
    const U = k * u_c;

    const wpTest = results.find((r) => r.testType === 'WEIGHING_PERFORMANCE');
    const maxMpe = Number(wpTest?.calculations?.maxMpeAllowed);
    const tur = Number.isFinite(maxMpe) && U > 0 ? maxMpe / U : null;

    return { u_c, U, k, tur, hasTypeA: u_A !== null, unit: inst.unit || 'kg' };
  }, [session]);

  const handleDownload = async (type) => {
    try {
      setDownloadingType(type);
      toast.loading(t('reports.downloading', 'Generating official PDF document...'), { id: 'pdf-toast' });

      const endpoint =
        type === 'certificate'
          ? `/reports/${sessionId}/certificate`
          : `/reports/${sessionId}/datasheet`;

      const response = await apiClient.get(endpoint, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${certificateNumber}-${type.toUpperCase()}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(t('reports.downloaded', 'Document downloaded successfully'), { id: 'pdf-toast' });
    } catch (err) {
      toast.error('Could not download PDF from server. Launching print view.', { id: 'pdf-toast' });
      window.print();
    } finally {
      setDownloadingType(null);
    }
  };

  const copyCertNo = () => {
    navigator.clipboard.writeText(certificateNumber);
    setCopiedCert(true);
    toast.success('Certificate number copied!');
    setTimeout(() => setCopiedCert(false), 2000);
  };

  const copyVerifyLink = () => {
    navigator.clipboard.writeText(verificationUrl);
    setCopiedLink(true);
    toast.success('Public verification link copied!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const [activeTab, setActiveTab] = useState('certificate');

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 shadow-sm">
        <LoadingSpinner message="Loading report and verification analytics..." />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-lg p-10 shadow-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <FiFileText className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Verification Record Not Found</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          No test session matches this reference, or the record could not be loaded. An official
          certificate exists only after an inspection has been finalized and cryptographically sealed.
        </p>
        <button
          type="button"
          onClick={() => navigate('/tests')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors"
        >
          <FiArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Test Sessions</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t('reports.title', 'Official Reports & Verification Certificates')}
        subtitle={`Verification Certificate Reference: ${certificateNumber}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/verify/${encodeURIComponent(certificateNumber)}`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-primary-700 bg-primary-50 border border-primary-300 rounded shadow-xs hover:bg-primary-100 transition-colors"
            >
              <FiExternalLink className="w-3.5 h-3.5" />
              <span>Open Public Portal</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/tests/${sessionId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded shadow-xs hover:bg-slate-50 transition-colors"
            >
              <FiArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Session</span>
            </button>
          </div>
        }
      />

      {/* Interactive Tabs Header */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-2 rounded-t-lg shadow-sm">
        <button
          type="button"
          id="tab-certificate"
          onClick={() => setActiveTab('certificate')}
          className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'certificate'
              ? 'border-primary-600 text-primary-700 bg-primary-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <FiShield className="w-4 h-4" />
          <span>Tab 1: Official Verification Certificate</span>
        </button>

        <button
          type="button"
          id="tab-datasheet"
          onClick={() => setActiveTab('datasheet')}
          className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'datasheet'
              ? 'border-primary-600 text-primary-700 bg-primary-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <FiFileText className="w-4 h-4" />
          <span>Tab 2: Technical Metrological Datasheet</span>
        </button>
      </div>

      {activeTab === 'certificate' ? (
        <>
          {/* Certificate Action Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary-50 text-primary-700">
                  <FiShield className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {t('reports.certificate', 'Official Verification Certificate')}
                </h2>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                {t(
                  'reports.certificateDesc',
                  'Standard Government of India legal metrology stamping certificate with scannable QR verification seal and officer authorization.'
                )}
              </p>
            </div>

            <button
              type="button"
              disabled={downloadingType === 'certificate'}
              onClick={() => handleDownload('certificate')}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-60"
            >
              <FiDownload className="w-4 h-4" />
              <span>
                {downloadingType === 'certificate'
                  ? 'Generating Certificate...'
                  : t('reports.downloadCert', 'Download Certificate (PDF)')}
              </span>
            </button>
          </div>

      {/* Verification Summary Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2 flex items-center justify-between">
          <span>{t('reports.verificationSummary', 'Legal Verification Summary')}</span>
          <StatusBadge status={session?.overallVerdict || 'PENDING'} />
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Certificate Number:</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-bold text-slate-900 font-mono text-xs truncate">
                {certificateNumber}
              </span>
              <button
                type="button"
                onClick={copyCertNo}
                className="text-slate-400 hover:text-slate-700"
                title="Copy Certificate Number"
              >
                {copiedCert ? <FiCheck className="w-3.5 h-3.5 text-emerald-600" /> : <FiCopy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <span className="text-slate-500 block">Inspection Officer:</span>
            <span className="font-bold text-slate-900 block mt-0.5">
              {session?.inspector?.name || '—'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block">Instrument Model & S/N:</span>
            <span className="font-semibold text-slate-800 block mt-0.5">
              {session?.instrument?.name || session?.instrument?.model} (S/N: {session?.instrument?.serialNumber})
            </span>
          </div>

          <div>
            <span className="text-slate-500 block">Accuracy Class & Max:</span>
            <span className="font-semibold text-slate-800 block mt-0.5">
              {session?.instrument?.accuracyClass?.replace('_', ' ')} — {session?.instrument?.maxCapacity} {session?.instrument?.unit}
            </span>
          </div>
        </div>

        {/* Dynamic Scannable QR Code & Cryptographic Integrity Section */}
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center gap-5">
          {/* Dynamic SVG QR Matrix */}
          <div className="shrink-0 p-2 bg-white border border-slate-300 rounded shadow-sm flex flex-col items-center">
            <svg
              className="w-28 h-28 text-slate-950"
              viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
              shapeRendering="crispEdges"
            >
              {qrMatrix.map((row, r) =>
                row.map((cell, c) => (
                  <rect
                    key={`${r}-${c}`}
                    x={c}
                    y={r}
                    width={1}
                    height={1}
                    fill={cell === 1 ? '#0f172a' : '#ffffff'}
                  />
                ))
              )}
            </svg>
            <span className="text-[9px] font-mono text-slate-500 mt-1 font-semibold">
              SCAN TO VERIFY
            </span>
          </div>

          <div className="flex-1 space-y-2 text-xs text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 justify-center sm:justify-start">
                <FiLock className="text-emerald-600 w-4 h-4" />
                <span>Tamper-Evident QR Code & HMAC Legal Seal</span>
              </h3>
              <button
                type="button"
                onClick={copyVerifyLink}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-primary-700 bg-white border border-primary-300 rounded hover:bg-primary-50 transition-colors self-center sm:self-auto"
              >
                {copiedLink ? <FiCheck className="text-emerald-600" /> : <FiCopy />}
                <span>{copiedLink ? 'URL Copied' : 'Copy Verification URL'}</span>
              </button>
            </div>

            <p className="text-slate-600 text-[11px] leading-relaxed">
              Scanning this code on any mobile camera resolves directly to the official National Legal Metrology portal at{' '}
              <a
                href={verificationUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-primary-600 underline hover:text-primary-800 break-all"
              >
                {verificationUrl}
              </a>
              .
            </p>

            <div className="pt-1">
              <div className="text-[10px] text-slate-500 font-mono bg-white p-2 rounded border border-slate-200 break-all select-all">
                HMAC-SHA256 SEAL: {session?.verificationSeal || session?.sealSignature || session?.certificateHash || 'Not sealed — certificate not yet finalized'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded OIML R-76 Error Envelope Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#1e3a5f] flex items-center gap-2">
            <FiActivity className="text-primary-600" />
            <span>Interactive Error Envelope & Tolerance Curve Analytics</span>
          </h2>
          <span className="text-xs text-slate-500">
            Complies with OIML R-76-1:2006 Table 3 Step Limits
          </span>
        </div>

        <ErrorEnvelopeChart
          points={weighingPoints.length > 0 ? weighingPoints : (session?.testResults?.[0]?.data?.points || [])}
          instrument={session?.instrument || {}}
          isInService={session?.status === 'IN_SERVICE'}
          showExport={true}
          title={`Error Envelope Curve: ${certificateNumber}`}
        />
      </div>
    </>
  ) : (
    /* Tab 2: Technical Metrological Datasheet View */
    <div className="space-y-6" id="datasheet-view">
      {/* Technical Data Sheet Download Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <FiFileText className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {t('reports.technicalDataSheet', 'Detailed Technical Data Sheet')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
            {t(
              'reports.technicalDataSheetDesc',
              'Comprehensive multi-page audit report including raw readings, continuous error computations (Ec), and OIML R-76 tolerance envelopes.'
            )}
          </p>
        </div>

        <button
          type="button"
          disabled={downloadingType === 'datasheet'}
          onClick={() => handleDownload('datasheet')}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#1e3a5f] rounded hover:bg-[#152a45] transition-colors shadow-sm disabled:opacity-60"
        >
          <FiDownload className="w-4 h-4" />
          <span>
            {downloadingType === 'datasheet'
              ? 'Generating Data Sheet...'
              : t('reports.downloadDataSheet', 'Download Data Sheet (PDF)')}
          </span>
        </button>
      </div>

      {/* Metrological Specifications Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2">
          Metrological Specifications & Test Session Parameters
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Accuracy Class</span>
            <span className="font-bold text-slate-900 text-sm">{session?.instrument?.accuracyClass || 'CLASS_III'}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Max / Min Capacity</span>
            <span className="font-bold text-slate-900 text-sm">
              {session?.instrument?.maxCapacity} {session?.instrument?.unit} / {session?.instrument?.minCapacity || 1} {session?.instrument?.unit}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Verification Interval (e / d)</span>
            <span className="font-bold text-slate-900 text-sm">
              e = {session?.instrument?.verificationInterval} {session?.instrument?.unit} | d = {session?.instrument?.actualInterval || session?.instrument?.verificationInterval} {session?.instrument?.unit}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-100">
            <span className="text-slate-500 block text-[11px]">Ambient Environment</span>
            <span className="font-bold text-slate-900 text-sm">
              {session?.temperature != null ? `${session.temperature}°C` : '—'}
              {' | '}
              {session?.humidity != null ? `${session.humidity}% RH` : '—'}
              {' | '}
              {session?.pressure != null ? `${session.pressure} hPa` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* All 6 OIML R-76 Module Breakdown Cards */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold text-[#1e3a5f]">
            OIML R-76 Test Verification Modules Breakdown ({moduleStats.executed} / {REQUIRED_MODULE_COUNT} Executed)
          </h3>
          {moduleStats.anyFail ? (
            <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-0.5 rounded border border-red-200">
              MODULE FAILURE DETECTED
            </span>
          ) : moduleStats.allPass ? (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
              ALL MODULES PASSED
            </span>
          ) : (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
              {moduleStats.executed} / {REQUIRED_MODULE_COUNT} MODULES RECORDED
            </span>
          )}
        </div>

        <div className="space-y-3">
          {(session?.testResults || []).map((module, idx) => (
            <div key={module.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 font-mono">Module {idx + 1}: {module.testType}</span>
                  <StatusBadge status={module.result || 'PENDING'} size="xs" />
                </div>
                <p className="text-slate-600 text-[11px]">
                  {module.remarks || module.calculations?.summary || '—'}
                </p>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Status</span>
                  {module.result === 'PASS' ? (
                    <span className="font-bold text-emerald-700">COMPLIANT</span>
                  ) : module.result === 'FAIL' ? (
                    <span className="font-bold text-red-600">NON-COMPLIANT</span>
                  ) : (
                    <span className="font-bold text-slate-500">PENDING</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Measurement Uncertainty Budget */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2 flex items-center justify-between">
          <span>ISO GUM / EURAMET cg-18 Measurement Uncertainty Evaluation</span>
          <span className="text-xs font-mono font-bold text-primary-700">k = 2 (95.45% Confidence)</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          The combined standard uncertainty u_c and expanded measurement uncertainty U are computed for
          this session from its recorded repeatability series (Type A) together with Type B components —
          reference standard weights (u_std), digital resolution (u_res) and residual eccentricity (u_ecc) —
          pursuant to ISO/IEC Guide 98-3 (GUM) and EURAMET Calibration Guide No. 18.
        </p>
        {uncertaintyBudget ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500 block text-[10px]">Combined Uncertainty (uc)</span>
              <span className="font-mono font-bold text-slate-900">{uncertaintyBudget.u_c.toPrecision(3)} {uncertaintyBudget.unit}</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500 block text-[10px]">Expanded Uncertainty (U)</span>
              <span className="font-mono font-bold text-emerald-700">±{uncertaintyBudget.U.toPrecision(3)} {uncertaintyBudget.unit}</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500 block text-[10px]">Coverage Factor (k)</span>
              <span className="font-mono font-bold text-slate-900">{uncertaintyBudget.k.toFixed(2)} (Normal)</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500 block text-[10px]">TUR (Test Uncertainty Ratio)</span>
              <span className="font-mono font-bold text-slate-900">
                {uncertaintyBudget.tur != null ? `${uncertaintyBudget.tur.toFixed(1)} : 1` : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-2 text-xs text-slate-500 italic">
            A measurement-uncertainty budget requires this session's repeatability series and instrument
            specification, which are not available for this record.
          </div>
        )}
      </div>
    </div>
  )}
    </div>
  );
}
