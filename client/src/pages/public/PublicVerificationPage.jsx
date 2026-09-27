import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FiShield,
  FiCheckCircle,
  FiAlertTriangle,
  FiSearch,
  FiMapPin,
  FiCalendar,
  FiUserCheck,
  FiLock,
  FiDownload,
  FiPrinter,
  FiCopy,
  FiExternalLink,
  FiCheck,
  FiCpu,
  FiActivity,
} from 'react-icons/fi';
import { verifyCertificate } from '../../services/publicApi';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import ErrorEnvelopeChart from '../../components/charts/ErrorEnvelopeChart';
import StateEmblem from '../../components/common/StateEmblem';

/**
 * Public Legal Metrology Verification Portal
 * Route: /verify/:certificateNo & /verify
 * 
 * Unauthenticated public route enabling traders, farmers, consumers, and enforcement officers
 * to instantly inspect authentic calibration certificates, OIML R-76 error envelope curves,
 * and cryptographic HMAC legal verification seals without requiring officer login.
 */
export default function PublicVerificationPage() {
  const { t } = useTranslation();
  const { certificateNo: paramCert } = useParams();
  const navigate = useNavigate();

  const [searchCert, setSearchCert] = useState(paramCert || '');
  const [activeCert, setActiveCert] = useState(paramCert || '');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSeal, setCopiedSeal] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-verify', activeCert],
    queryFn: async () => {
      if (!activeCert) return null;
      return await verifyCertificate(activeCert);
    },
    enabled: !!activeCert,
    retry: 1,
  });

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchCert.trim()) {
      setActiveCert(searchCert.trim());
      navigate(`/verify/${encodeURIComponent(searchCert.trim())}`, { replace: true });
    }
  };

  const copyVerificationUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copySealSignature = () => {
    if (data?.sealSignature) {
      navigator.clipboard.writeText(data.sealSignature);
      setCopiedSeal(true);
      setTimeout(() => setCopiedSeal(false), 2000);
    }
  };

  // Format helpers — never render "Invalid Date"; show a neutral placeholder instead.
  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const formatDateTime = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN');
  };

  // Status computation — trust the backend's authoritative finalStatus, which already
  // splits authenticity (seal), verdict (PASS/FAIL) and validity (expiry) into a single
  // classification: VERIFIED_LEGAL / EXPIRED / REJECTED / TAMPERED / UNKNOWN.
  const verificationStatus = useMemo(() => {
    if (!data) return 'UNKNOWN';
    const s = String(data.status || '').toUpperCase();
    if (['VERIFIED_LEGAL', 'EXPIRED', 'REJECTED', 'TAMPERED', 'UNKNOWN'].includes(s)) return s;
    // Legacy fallback if the registry did not classify the record.
    if (data.overallResult === 'FAIL' || data.valid === false) return 'REJECTED';
    return 'VERIFIED_LEGAL';
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between text-slate-800">
      {/* Official Government Emblem & Top Banner */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 via-white to-green-600" />
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StateEmblem size="sm" showMotto={false} />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Department of Legal Metrology
              </div>
              <div className="text-[11px] text-slate-500 hidden sm:block">
                Ministry of Consumer Affairs, Food & Public Distribution | Government of India
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
              <FiShield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Public Verification Portal</span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-xs font-bold text-primary-700 hover:text-primary-900 px-3 py-1.5 rounded border border-primary-300 bg-white hover:bg-slate-50 transition-colors"
            >
              Officer Portal →
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-6 w-full space-y-6 flex-1">
        {/* Certificate Lookup Bar */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
          <div className="text-center sm:text-left sm:flex sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-2 justify-center sm:justify-start">
                <FiSearch className="text-primary-600" />
                <span>National NAWI Verification Certificate Registry</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan QR Code or enter Stamping Certificate Reference to inspect OIML R-76 legal status & digital seals.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2 mt-3 sm:mt-0 max-w-md w-full">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchCert}
                  onChange={(e) => setSearchCert(e.target.value)}
                  placeholder="e.g. CERT-2026-APMC-PUNJAB-9901"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-slate-900 font-bold"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#1e3a5f] hover:bg-[#152a45] rounded shadow-sm transition-colors shrink-0"
              >
                Verify
              </button>
            </form>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white border border-slate-200 rounded-lg p-12 shadow-sm text-center">
            <LoadingSpinner message="Querying National Legal Metrology Registry..." />
          </div>
        )}

        {/* Error / Not Found State */}
        {isError && !isLoading && (
          <div className="bg-white border border-red-200 rounded-lg p-8 shadow-sm text-center space-y-3">
            <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-full">
              <FiAlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-red-900">Certificate Reference Not Found</h2>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              No active legal metrology verification certificate matches <strong>{activeCert}</strong>. The physical instrument stamp may be unverified, altered, or fraudulent.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSearchCert('')}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors"
              >
                Search Another Certificate
              </button>
            </div>
          </div>
        )}

        {/* Verified Digital Certificate Card */}
        {data && !isLoading && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-md overflow-hidden space-y-6">
            {/* Status Banner */}
            <div
              className={`p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 ${
                verificationStatus === 'VERIFIED_LEGAL'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700'
                  : verificationStatus === 'EXPIRED'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-700'
                  : verificationStatus === 'UNKNOWN'
                  ? 'bg-gradient-to-r from-slate-600 to-slate-700'
                  : 'bg-gradient-to-r from-red-600 to-rose-700'
              }`}
            >
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="p-2.5 bg-white/20 rounded-full shrink-0">
                  {verificationStatus === 'VERIFIED_LEGAL' ? (
                    <FiCheckCircle className="w-8 h-8 text-white" />
                  ) : (
                    <FiAlertTriangle className="w-8 h-8 text-white" />
                  )}
                </div>
                <div>
                  <div className="text-base font-bold tracking-wide">
                    {verificationStatus === 'VERIFIED_LEGAL' && 'OFFICIALLY VERIFIED & LEGAL METROLOGY CERTIFIED'}
                    {verificationStatus === 'EXPIRED' && 'CERTIFICATE EXPIRED — RE-VERIFICATION MANDATORY'}
                    {verificationStatus === 'REJECTED' && 'VERIFICATION REJECTED — UNFIT FOR COMMERCIAL USE'}
                    {verificationStatus === 'TAMPERED' && 'SEAL MISMATCH — CERTIFICATE TAMPERED OR FORGED'}
                    {verificationStatus === 'UNKNOWN' && 'STATUS INDETERMINATE — RECORD NOT FINALIZED'}
                  </div>
                  <div className="text-xs text-white/90">
                    Compliant with Legal Metrology Act, 2009 & OIML Recommendation R-76 (Edition 2006/E)
                  </div>
                </div>
              </div>

              <div className="bg-white text-slate-900 px-3.5 py-2 rounded text-xs font-mono font-bold shadow text-center sm:text-right">
                <span className="text-[10px] text-slate-500 block">Certificate No:</span>
                <span className="text-sm">{data.certificateNumber || data.certificateNo}</span>
              </div>
            </div>

            <div className="p-6 pt-0 space-y-6">
              {/* Instrument & Stamping Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* Instrument Specifications */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block">Instrument Model & Serial</span>
                  <span className="text-sm font-bold text-slate-900 block truncate">
                    {data.instrument?.name || data.instrument?.model}
                  </span>
                  <span className="font-mono text-slate-600 text-[11px] block">
                    S/N: {data.instrument?.serialNumber || 'N/A'}
                  </span>
                </div>

                {/* Capacity & Verification Scale Interval */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block">Class & Maximum Capacity</span>
                  <span className="text-sm font-bold text-slate-900 block">
                    {data.instrument?.accuracyClass?.replace('_', ' ') || 'Class III'}
                  </span>
                  <span className="text-slate-700 font-semibold text-[11px] block">
                    Max: {data.instrument?.maxCapacity} {data.instrument?.unit} (e = {data.instrument?.verificationInterval} {data.instrument?.unit})
                  </span>
                </div>

                {/* Stamping Location */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block flex items-center gap-1">
                    <FiMapPin className="text-slate-400" /> Stamping Location
                  </span>
                  <span className="text-xs font-bold text-slate-900 block truncate">
                    {data.instrument?.location || '—'}
                  </span>
                  <span className="text-slate-500 text-[11px] block">
                    State Directorate of Legal Metrology
                  </span>
                </div>

                {/* Verification Date */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block flex items-center gap-1">
                    <FiCalendar className="text-slate-400" /> Date of Verification
                  </span>
                  <span className="text-xs font-bold text-slate-900 block font-mono">
                    {formatDate(data.verificationDate)}
                  </span>
                  <span className="text-emerald-700 text-[11px] font-semibold">
                    Stamping Cycle: Initial Verification
                  </span>
                </div>

                {/* Expiry Date */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block flex items-center gap-1">
                    <FiCalendar className="text-slate-400" /> Validity Expiration Date
                  </span>
                  <span className="text-xs font-bold text-slate-900 block font-mono">
                    {formatDate(data.expiryDate)}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Statutory 1-Year Calibration Validity
                  </span>
                </div>

                {/* Verification Officer */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1">
                  <span className="text-[11px] text-slate-500 font-medium block flex items-center gap-1">
                    <FiUserCheck className="text-slate-400" /> Authorizing Officer
                  </span>
                  <span className="text-xs font-bold text-slate-900 block truncate">
                    {data.verificationOfficer?.name || data.conductedBy || '—'}
                  </span>
                  <span className="text-slate-500 text-[11px] block truncate">
                    {data.verificationOfficer?.designation || 'Legal Metrology Officer'}
                  </span>
                </div>
              </div>

              {/* Interactive OIML R-76 Error Envelope Chart */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FiActivity className="text-primary-600" />
                    <span>Visual Error Envelope & OIML R-76 MPE Curve</span>
                  </h2>
                  <span className="text-xs text-slate-500">
                    Live interactive graph with loading/unloading tolerance verification
                  </span>
                </div>

                <ErrorEnvelopeChart
                  points={data.errorCurveData || []}
                  instrument={data.instrument || {}}
                  isInService={data.status === 'IN_SERVICE'}
                  showExport={true}
                  title={`Error Envelope Curve: ${data.certificateNumber}`}
                />
              </div>

              {/* Cryptographic Digital Seal & Anti-Tampering Anchor */}
              <div className="p-4 bg-slate-900 text-white rounded-lg space-y-3 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <FiLock className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      Cryptographic HMAC-SHA256 Digital Verification Seal
                    </span>
                  </div>
                  {data.authentic ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 w-fit">
                      <FiCheck className="w-3 h-3" />
                      <span>AUTHENTIC & UNTAMPERED</span>
                    </span>
                  ) : data.sealSignature ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1 w-fit">
                      <FiAlertTriangle className="w-3 h-3" />
                      <span>SEAL MISMATCH — TAMPERED</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30 flex items-center gap-1 w-fit">
                      <FiAlertTriangle className="w-3 h-3" />
                      <span>NO DIGITAL SEAL ON RECORD</span>
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-400">
                    Deterministic cryptographic seal anchoring certificate payload, instrument serial, accuracy class, capacity, and inspector identity:
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800 flex items-center justify-between gap-2">
                    {data.sealSignature ? (
                      <>
                        <span className="font-mono text-[11px] text-emerald-400 break-all select-all">
                          {data.sealSignature}
                        </span>
                        <button
                          type="button"
                          onClick={copySealSignature}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
                          title="Copy Seal Hash"
                        >
                          {copiedSeal ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FiCopy className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-500 italic break-all">
                        No cryptographic seal is recorded for this certificate.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Share, Print, Copy Link */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyVerificationUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
                  >
                    {copiedLink ? <FiCheck className="w-3.5 h-3.5 text-emerald-600" /> : <FiCopy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link Copied' : 'Copy Verification Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
                  >
                    <FiPrinter className="w-3.5 h-3.5" />
                    <span>Print Verification Slip</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 italic">
                  Verified timestamp: {formatDateTime(data.verifiedAt)}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Official Government Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700">
            Ministry of Consumer Affairs, Food & Public Distribution | Government of India
          </p>
          <p className="text-[11px] text-slate-500">
            National Legal Metrology Portal • Legal Metrology Act, 2009 & OIML Recommendation R-76 Certified
          </p>
        </div>
      </footer>
    </div>
  );
}
