import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiPlus, FiEdit2, FiCalendar, FiMapPin, FiCpu, FiFileText } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import StatusBadge from '../../components/shared/StatusBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import DataTable from '../../components/shared/DataTable';
import { useAuth } from '../../contexts/AuthContext';

export default function InstrumentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isInspector } = useAuth();
  const [activeTab, setActiveTab] = useState('history');

  // Fetch instrument details
  const { data: instrument, isLoading: isInstLoading } = useQuery({
    queryKey: ['instrument', id],
    queryFn: async () => {
      const res = await apiClient.get(`/instruments/${id}`);
      const raw = res.data?.data || res.data;
      return {
        ...raw,
        verificationScaleInterval_e: raw.verificationInterval ?? raw.verificationScaleInterval_e,
        actualScaleInterval_d: raw.actualInterval ?? raw.actualScaleInterval_d,
        instrumentType: raw.type ?? raw.instrumentType,
      };
    },
  });

  // Fetch test history for this instrument
  const { data: testSessions, isLoading: isSessionsLoading } = useQuery({
    queryKey: ['instrument-sessions', id],
    queryFn: async () => {
      const res = await apiClient.get(`/tests?instrumentId=${id}`);
      const list = res.data?.data || res.data?.testSessions || (Array.isArray(res.data) ? res.data : []);
      return list.map((s) => ({
        ...s,
        certificateNumber: s.certificateNo || s.certificateNumber,
        testDate: s.startedAt || s.createdAt || s.testDate,
        overallVerdict: s.overallResult || s.overallVerdict,
        inspector: s.conductedBy || s.inspector,
      }));
    },
  });

  if (isInstLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12">
        <LoadingSpinner message="Loading instrument details..." />
      </div>
    );
  }

  if (!instrument) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-600">
        Instrument not found.
      </div>
    );
  }

  const historyColumns = [
    {
      header: 'Certificate Number',
      accessor: 'certificateNumber',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-primary-700 text-xs font-mono">
          {row.certificateNumber}
        </span>
      ),
    },
    {
      header: 'Test Date',
      accessor: 'testDate',
      sortable: true,
      render: (row) => (
        <span className="text-xs text-slate-600">
          {row.testDate ? new Date(row.testDate).toLocaleDateString() : '-'}
        </span>
      ),
    },
    {
      header: 'Inspector',
      accessor: (row) => row.inspector?.name || 'Officer',
      cellClass: 'text-xs font-medium text-slate-800',
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} size="xs" />,
    },
    {
      header: 'Verdict',
      accessor: 'overallVerdict',
      render: (row) => <StatusBadge status={row.overallVerdict} size="xs" />,
    },
    {
      header: 'Action',
      cellClass: 'text-right',
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/tests/${row.id}`)}
          className="text-xs font-bold text-primary-600 hover:text-primary-800 px-2 py-1 bg-primary-50 rounded border border-primary-200"
        >
          View Session
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={instrument.model}
        subtitle={`Serial Number: ${instrument.serialNumber} | Manufacturer: ${instrument.manufacturer}`}
        actions={
          <div className="flex items-center gap-2">
            {isInspector && (
              <button
                type="button"
                onClick={() => navigate(`/instruments/${id}/edit`)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 transition-colors"
              >
                <FiEdit2 className="w-3.5 h-3.5" />
                <span>{t('common.edit', 'Edit')}</span>
              </button>
            )}
            {isInspector && (
              <button
                type="button"
                onClick={() => navigate(`/tests/new?instrumentId=${id}`)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-primary-600 rounded shadow-sm hover:bg-primary-700 transition-colors"
              >
                <FiPlus className="w-3.5 h-3.5" />
                <span>{t('instruments.startNewTest', 'Start New Test Session')}</span>
              </button>
            )}
          </div>
        }
      />

      {/* Overview Top Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-50 text-primary-700 rounded-lg">
              <FiCpu className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold text-[#1e3a5f]">{instrument.model}</div>
              <div className="text-xs text-slate-500 font-mono">
                S/N: {instrument.serialNumber}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={instrument.isActive !== false ? 'ACTIVE' : 'INACTIVE'} />
            <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 text-[#1e3a5f] border border-slate-300">
              {instrument.accuracyClass}
            </span>
          </div>
        </div>

        {/* Metrological Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 p-3 rounded border border-slate-100">
            <span className="text-slate-500 block">Max Capacity</span>
            <span className="text-base font-bold text-slate-900">
              {instrument.maxCapacity} {instrument.unit}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded border border-slate-100">
            <span className="text-slate-500 block">Min Capacity</span>
            <span className="text-base font-bold text-slate-900">
              {instrument.minCapacity} {instrument.unit}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded border border-slate-100">
            <span className="text-slate-500 block">Verification Interval (e)</span>
            <span className="text-base font-bold text-slate-900">
              {instrument.verificationScaleInterval_e} {instrument.unit}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded border border-slate-100">
            <span className="text-slate-500 block">Actual Interval (d)</span>
            <span className="text-base font-bold text-slate-900">
              {instrument.actualScaleInterval_d} {instrument.unit}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <FiMapPin className="text-slate-400" />
            <span>
              <strong>Location:</strong> {instrument.location}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <FiCalendar className="text-slate-400" />
            <span>
              <strong>Registered:</strong>{' '}
              {instrument.createdAt ? new Date(instrument.createdAt).toLocaleDateString() : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-primary-600 text-primary-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t('instruments.testHistory', 'Verification History')} ({testSessions?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-primary-600 text-primary-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Metrological Specifications
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'history' && (
          <DataTable
            columns={historyColumns}
            data={testSessions || []}
            isLoading={isSessionsLoading}
            emptyMessage={t('instruments.noHistory', 'No test sessions recorded for this instrument yet.')}
            onRowClick={(row) => navigate(`/tests/${row.id}`)}
          />
        )}

        {activeTab === 'details' && (
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2">
              OIML R-76 Classification & Tolerances
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500">Scale Verification Factor (n = Max / e):</p>
                <p className="font-bold text-slate-800 font-mono">
                  {(() => {
                    const max = Number(instrument.maxCapacity);
                    const e = Number(instrument.verificationScaleInterval_e);
                    if (!Number.isFinite(max) || !Number.isFinite(e) || e <= 0) {
                      return '—';
                    }
                    return Math.round(max / e).toLocaleString();
                  })()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Verification Type:</p>
                <p className="font-bold text-slate-800">
                  {instrument.verificationType === 'IN_SERVICE'
                    ? 'In-Service Verification (2x MPE)'
                    : 'Initial Verification (1x MPE)'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tare Type & Limit:</p>
                <p className="font-bold text-slate-800">
                  {instrument.tareType || 'SUBTRACTIVE'} {instrument.maxTare ? `(Max: ${instrument.maxTare} ${instrument.unit})` : ''}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Operating Temperature Limits:</p>
                <p className="font-bold text-slate-800">
                  {instrument.tempRangeMin ?? 10}°C to {instrument.tempRangeMax ?? 40}°C
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
