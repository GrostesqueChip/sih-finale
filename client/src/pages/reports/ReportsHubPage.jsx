import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FiFileText,
  FiDownload,
  FiEye,
  FiAlertCircle,
  FiRefreshCw,
  FiCheckCircle,
  FiExternalLink,
} from 'react-icons/fi';
import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import StatusBadge from '../../components/shared/StatusBadge';

/** Format a date safely — returns an em dash rather than "Invalid Date". */
function safeDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
}

export default function ReportsHubPage() {
  const navigate = useNavigate();
  const [downloadingId, setDownloadingId] = useState(null);

  const { data: sessions, isLoading, isError } = useQuery({
    queryKey: ['completed-sessions-hub'],
    queryFn: async () => {
      const res = await apiClient.get('/tests');
      // Handle different response shapes
      const raw = Array.isArray(res.data)
        ? res.data
        : res.data?.data || res.data?.sessions || [];
      // Filter for COMPLETED sessions only
      return raw.filter((s) => s.status === 'COMPLETED');
    },
  });

  const handleDownloadPdf = async (session, type = 'certificate') => {
    const downloadKey = `${session.id}-${type}`;
    const certNumber = session.certificateNo || session.certificateNumber || session.id?.substring(0, 8);
    const docTitle = type === 'certificate' ? 'Verification Certificate' : 'Technical Datasheet';

    try {
      setDownloadingId(downloadKey);
      toast.loading(`Preparing official ${docTitle} (PDF)...`, { id: 'hub-download-toast' });

      const endpoint =
        type === 'certificate'
          ? `/reports/${session.id}/certificate`
          : `/reports/${session.id}/datasheet`;

      const response = await apiClient.get(endpoint, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${certNumber}-${type.toUpperCase()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`${docTitle} downloaded successfully!`, { id: 'hub-download-toast' });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error(`Could not stream PDF from server. Opening interactive certificate viewer...`, {
        id: 'hub-download-toast',
      });
      navigate(`/reports/${session.id}${type === 'datasheet' ? '?type=datasheet' : ''}`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Test Certificates"
        subtitle="Download official OIML R-76 test certificates and technical datasheets for completed verifications"
        actions={
          <button
            type="button"
            onClick={() => navigate('/tests')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 transition-colors"
          >
            <FiEye className="w-3.5 h-3.5" />
            View All Test Sessions
          </button>
        }
      />

      {isLoading && (
        <div className="py-12 flex justify-center">
          <LoadingSpinner message="Loading completed verifications..." />
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-5 rounded-lg flex items-center gap-3">
          <FiAlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Unable to load reports</p>
            <p className="text-xs mt-0.5">Check your connection and try again.</p>
          </div>
        </div>
      )}

      {sessions && sessions.length === 0 && (
        <div className="bg-white border border-slate-200 p-12 rounded-lg text-center">
          <FiFileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No completed verifications yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Completed test sessions will appear here with direct PDF download options.
          </p>
          <button
            type="button"
            onClick={() => navigate('/tests/new')}
            className="mt-4 px-4 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded transition-colors"
          >
            + New Test Session
          </button>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sessions.map((session) => {
            const isDownloadingCert = downloadingId === `${session.id}-certificate`;
            const isDownloadingDatasheet = downloadingId === `${session.id}-datasheet`;

            return (
              <div
                key={session.id}
                className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-[#1e3a5f] truncate">
                        {session.certificateNo || session.certificateNumber || session.id?.substring(0, 12) + '...'}
                      </p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">
                        {session.instrument?.model || session.instrument?.name || 'NAWI Instrument'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        S/N: {session.instrument?.serialNumber || 'N/A'}
                      </p>
                    </div>
                    <StatusBadge
                      status={session.overallResult || session.overallVerdict || 'COMPLETED'}
                      size="xs"
                    />
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-xs bg-slate-50 p-2.5 rounded border border-slate-100">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Test Date</span>
                      <p className="font-semibold text-slate-700 font-mono">
                        {safeDate(session.startedAt || session.createdAt)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Verification Officer</span>
                      <p className="font-semibold text-slate-700 truncate">
                        {session.conductedBy?.name || session.inspector?.name || 'Officer'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  {/* Real PDF Certificate Download */}
                  <button
                    type="button"
                    disabled={isDownloadingCert}
                    onClick={() => handleDownloadPdf(session, 'certificate')}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white bg-[#1e3a5f] hover:bg-[#152843] rounded transition-colors shadow-xs disabled:opacity-70"
                  >
                    {isDownloadingCert ? (
                      <>
                        <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Downloading Certificate...</span>
                      </>
                    ) : (
                      <>
                        <FiDownload className="w-3.5 h-3.5" />
                        <span>Download Certificate (PDF)</span>
                      </>
                    )}
                  </button>

                  {/* Real PDF Datasheet Download */}
                  <button
                    type="button"
                    disabled={isDownloadingDatasheet}
                    onClick={() => handleDownloadPdf(session, 'datasheet')}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded transition-colors disabled:opacity-70"
                  >
                    {isDownloadingDatasheet ? (
                      <>
                        <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Downloading Datasheet...</span>
                      </>
                    ) : (
                      <>
                        <FiFileText className="w-3.5 h-3.5" />
                        <span>Technical Datasheet (PDF)</span>
                      </>
                    )}
                  </button>

                  {/* View Details Navigation */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/reports/${session.id}`)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded border border-slate-200 transition-colors"
                    >
                      <FiEye className="w-3 h-3" />
                      <span>View Online</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/tests/${session.id}`)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded border border-slate-200 transition-colors"
                    >
                      <span>Session Log</span>
                      <FiExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
