import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiCpu, FiAlertCircle } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

export default function NewTestSessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialInstId = searchParams.get('instrumentId') || '';

  const [selectedInstrumentId, setSelectedInstrumentId] = useState(initialInstId);
  const [ambientTemp, setAmbientTemp] = useState(22.0);
  const [relativeHumidity, setRelativeHumidity] = useState(55.0);
  const [atmosphericPressure, setAtmosphericPressure] = useState(1013.25);
  const [standardWeightsUsed, setStandardWeightsUsed] = useState(
    'Standard Metrological Weight Set Class E2/F1/M1 (National Physical Laboratory calibrated)'
  );
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Fetch available instruments. We deliberately do NOT fabricate a fallback
  // registry on failure: inventing instruments here would let an officer open a
  // verification session against a scale that does not exist in the registry,
  // and the invented specs (Max / e / class) would silently drive fabricated
  // MPE and uncertainty math downstream. On error we surface an honest empty
  // state instead.
  const {
    data: instruments,
    isLoading: isInstLoading,
    isError: isInstError,
    error: instError,
    refetch: refetchInstruments,
  } = useQuery({
    queryKey: ['instruments-select'],
    queryFn: async () => {
      const res = await apiClient.get('/instruments');
      return Array.isArray(res.data) ? res.data : res.data?.data || res.data?.instruments || [];
    },
  });

  useEffect(() => {
    if (!selectedInstrumentId && instruments && instruments.length > 0) {
      setSelectedInstrumentId(instruments[0].id);
    }
  }, [instruments, selectedInstrumentId]);

  const selectedInstrument = instruments?.find((inst) => inst.id === selectedInstrumentId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInstrumentId) {
      toast.error('Please select an instrument to verify.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const payload = {
        instrumentId: selectedInstrumentId,
        ambientTemp: Number(ambientTemp),
        relativeHumidity: Number(relativeHumidity),
        atmosphericPressure: Number(atmosphericPressure),
        standardWeightsUsed,
        remarks: remarks.trim() || undefined,
      };

      const res = await apiClient.post('/tests', payload);
      toast.success('Test session initialized successfully.');
      const sessionId = res.data.data?.id || res.data.id || res.data.session?.id;
      navigate(`/tests/${sessionId}`);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Unable to initialize test session. Please ensure the selected instrument exists in the active registry and try again.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInstLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12">
        <LoadingSpinner message="Loading available instruments..." />
      </div>
    );
  }

  if (isInstError) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          title={t('tests.newSessionTitle', 'Create New Test Session')}
          subtitle="Initialize verification session per OIML R-76 standard procedures"
        />
        <div className="bg-white border border-red-200 rounded-lg p-8 shadow-sm text-center">
          <FiAlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-red-800 mb-1">
            Instrument registry unavailable
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            The instrument registry could not be reached, so no verification session can be
            started right now. No instruments are shown because inventing one would let a
            session be sealed against a scale that is not on record.
          </p>
          {instError?.message && (
            <p className="text-[11px] text-slate-400 mt-2 font-mono">{instError.message}</p>
          )}
          <button
            type="button"
            onClick={() => refetchInstruments()}
            className="mt-4 px-4 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={t('tests.newSessionTitle', 'Create New Test Session')}
        subtitle="Initialize verification session per OIML R-76 standard procedures"
      />

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 shadow-sm">
          <FiAlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800 space-y-0.5">
            <span className="font-bold block">Test Session Creation Failed</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Instrument Selection */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2">
            1. Select Instrument for Verification
          </h2>

          <div>
            <label
              htmlFor="instrumentSelect"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
            >
              {t('tests.selectInstrument', 'Select Weighing Instrument')} *
            </label>
            <select
              id="instrumentSelect"
              value={selectedInstrumentId}
              onChange={(e) => setSelectedInstrumentId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 font-bold text-slate-800"
            >
              <option value="">-- Choose Instrument from Registry --</option>
              {instruments?.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.model} — S/N: {inst.serialNumber} ({inst.accuracyClass}, Max: {inst.maxCapacity} {inst.unit})
                </option>
              ))}
            </select>
            {(!instruments || instruments.length === 0) && (
              <p className="text-[11px] text-amber-700 mt-1.5">
                No instruments are registered yet. Add an instrument to the registry before
                starting a verification session.
              </p>
            )}
          </div>

          {/* Selected Instrument Summary Card */}
          {selectedInstrument && (
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary-100 text-primary-800 rounded">
                  <FiCpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">{selectedInstrument.model}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    S/N: {selectedInstrument.serialNumber} | Mfr: {selectedInstrument.manufacturer}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Location: {selectedInstrument.location}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px]">ACCURACY CLASS</span>
                  <span className="font-bold text-[#1e3a5f] px-2 py-0.5 bg-white border border-slate-300 rounded">
                    {selectedInstrument.accuracyClass}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px]">MAX / e</span>
                  <span className="font-bold text-slate-900">
                    {selectedInstrument.maxCapacity} {selectedInstrument.unit} / {selectedInstrument.verificationScaleInterval_e} {selectedInstrument.unit}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Environmental Test Conditions */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2">
            2. Ambient Environmental Conditions
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="ambientTemp"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                {t('tests.ambientTemp', 'Ambient Temp (°C)')} *
              </label>
              <input
                id="ambientTemp"
                type="number"
                step="0.1"
                required
                value={ambientTemp}
                onChange={(e) => setAmbientTemp(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Standard: 20°C ± 5°C</p>
            </div>

            <div>
              <label
                htmlFor="relativeHumidity"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                {t('tests.relativeHumidity', 'Relative Humidity (%)')} *
              </label>
              <input
                id="relativeHumidity"
                type="number"
                step="0.1"
                required
                value={relativeHumidity}
                onChange={(e) => setRelativeHumidity(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Standard: 40% - 70% RH</p>
            </div>

            <div>
              <label
                htmlFor="atmosphericPressure"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                {t('tests.atmosphericPressure', 'Atmospheric Pressure (hPa)')} *
              </label>
              <input
                id="atmosphericPressure"
                type="number"
                step="any"
                required
                value={atmosphericPressure}
                onChange={(e) => setAtmosphericPressure(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Standard: 1013.25 hPa</p>
            </div>
          </div>

          <div>
            <label
              htmlFor="standardWeightsUsed"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
            >
              {t('tests.standardWeights', 'Standard Weights Used')} *
            </label>
            <input
              id="standardWeightsUsed"
              type="text"
              required
              value={standardWeightsUsed}
              onChange={(e) => setStandardWeightsUsed(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="remarks"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
            >
              Initial Remarks / Observations
            </label>
            <textarea
              id="remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Visual inspection passed, leveling bubbles centered, warmup completed."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/tests')}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
          >
            <FiX className="w-3.5 h-3.5" />
            <span>{t('common.cancel', 'Cancel')}</span>
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-60"
          >
            <FiCheck className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Creating...' : t('tests.startSession', 'Create Test Session')}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
