import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiShield, FiSearch, FiLock, FiInfo, FiAlertCircle } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import DataTable from '../../components/shared/DataTable';

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  const { data: auditLogs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const res = await apiClient.get('/audit');
      const list = res.data?.data || res.data?.logs || (Array.isArray(res.data) ? res.data : []);
      return list.map((log) => ({
        ...log,
        timestamp: log.createdAt || log.timestamp,
        userName: log.user?.name || log.userName || 'System / Officer',
        userRole: log.user?.role || log.userRole || 'SYSTEM',
        hash: log.hash || log.id?.substring(0, 16) || '—',
      }));
    },
  });

  const filteredLogs = useMemo(() => {
    if (!auditLogs) return [];
    return auditLogs.filter((log) => {
      const matchesSearch =
        searchTerm === '' ||
        log.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entityId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesAction = selectedAction === '' || log.action === selectedAction;
      return matchesSearch && matchesAction;
    });
  }, [auditLogs, searchTerm, selectedAction]);

  const columns = [
    {
      header: t('audit.timestamp', 'Timestamp (IST)'),
      accessor: 'timestamp',
      sortable: true,
      render: (row) => {
        if (!row.timestamp) return <span className="text-xs text-slate-600 font-mono">-</span>;
        const d = new Date(row.timestamp);
        // The column header says "IST", so format explicitly in Asia/Kolkata
        // rather than trusting the browser's local timezone.
        const text = Number.isNaN(d.getTime())
          ? '-'
          : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        return <span className="text-xs text-slate-600 font-mono">{text}</span>;
      },
    },
    {
      header: t('audit.user', 'Officer / User'),
      accessor: 'userName',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 text-xs">{row.userName}</div>
          <div className="text-[10px] text-slate-500 uppercase">{row.userRole}</div>
        </div>
      ),
    },
    {
      header: t('audit.action', 'Action'),
      accessor: 'action',
      sortable: true,
      render: (row) => (
        <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-slate-100 text-[#1e3a5f] border border-slate-300 font-mono">
          {row.action}
        </span>
      ),
    },
    {
      header: t('audit.entityType', 'Entity'),
      accessor: 'entityType',
      render: (row) => (
        <span className="text-xs font-semibold text-slate-700">
          {row.entityType}
        </span>
      ),
    },
    {
      header: t('audit.details', 'Details'),
      accessor: 'details',
      cellClass: 'text-xs text-slate-700 max-w-sm',
    },
    {
      header: t('audit.ipAddress', 'IP Address'),
      accessor: 'ipAddress',
      cellClass: 'text-xs text-slate-500 font-mono',
    },
    {
      header: 'Record ID',
      accessor: 'hash',
      render: (row) => (
        <span
          className="text-[10px] text-slate-400 font-mono block max-w-[120px] truncate"
          title={row.hash}
        >
          {row.hash}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('audit.title', 'Immutable Audit Trail')}
        subtitle={t('audit.subtitle', 'Cryptographically chained log of all metrological actions, modifications, and signatures')}
      />

      {/* Security Notice Banner */}
      <div className="p-4 bg-primary-50/70 border border-primary-200 rounded-lg flex items-center gap-3 text-xs text-primary-900">
        <FiLock className="w-5 h-5 text-primary-700 shrink-0" />
        <div>
          <span className="font-bold">Cryptographically Protected Record: </span>
          {t('audit.tamperProof', 'All audit entries are protected by PostgreSQL immutability rules and server-side access controls.')}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <FiSearch className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search action, officer, entity ID..."
            aria-label="Search audit log by action, officer, or entity ID"
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 focus:bg-white text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            aria-label="Filter by Action Type"
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">All Action Types</option>
            <option value="LOGIN">LOGIN</option>
            <option value="CREATE_INSTRUMENT">CREATE_INSTRUMENT</option>
            <option value="CREATE_TEST_SESSION">CREATE_TEST_SESSION</option>
            <option value="RECORD_TEST_POINTS">RECORD_TEST_POINTS</option>
            <option value="FINALIZE_TEST_SESSION">FINALIZE_TEST_SESSION</option>
            <option value="GENERATE_CERTIFICATE_PDF">GENERATE_CERTIFICATE_PDF</option>
          </select>

          {(searchTerm || selectedAction) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedAction('');
              }}
              className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {isError ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 shadow-sm text-center">
          <FiAlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-red-800 mb-1">
            Unable to load the audit trail
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            The audit log could not be retrieved. This is a server or permission error — it does
            not mean the log is empty.
          </p>
          {error?.message && (
            <p className="text-[11px] text-slate-400 mt-2 font-mono">{error.message}</p>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded"
          >
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredLogs}
          isLoading={isLoading}
          emptyMessage="No audit logs matching search criteria."
        />
      )}
    </div>
  );
}
