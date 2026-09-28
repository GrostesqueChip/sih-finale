import React, { useState, useRef } from 'react';
import {
  FiUploadCloud,
  FiFileText,
  FiCheckCircle,
  FiAlertTriangle,
  FiX,
  FiDownload,
  FiArrowRight,
  FiLayers,
  FiCheck,
  FiTrendingUp,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import apiClient from '../../hooks/useApi';
import useModalA11y from '../../hooks/useModalA11y';

/**
 * BatchCsvModal Component
 * Drag-and-drop CSV/Excel import for 10-point weighbridge calibration series with
 * metrological validation preview, turning-point error calculation, and one-click injection.
 */
export default function BatchCsvModal({
  isOpen,
  onClose,
  sessionId = null,
  instrument = {},
  onImportSuccess = null,
}) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // Accessibility: Esc-to-close, focus-trap, scroll-lock, focus restore.
  // The hook itself no-ops while `isOpen` is false, so it is safe to call
  // unconditionally above the early return below.
  const { containerRef, dialogProps } = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const maxCap = Number(instrument?.maxCapacity) || 100000;
  const intervalE = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 20;
  const unit = instrument?.unit || 'kg';

  /**
   * Handle Drag & Drop events
   */
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processSelectedFile(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processSelectedFile(file);
    }
  };

  /**
   * Upload & preview CSV parsing from server
   */
  const processSelectedFile = async (file) => {
    if (!file.name.match(/\.(csv|txt|tsv)$/i)) {
      toast.error('Please upload a valid .csv or .tsv calibration file.');
      return;
    }

    setSelectedFile(file);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (sessionId) formData.append('sessionId', sessionId);
      formData.append('maxCapacity', maxCap);
      formData.append('verificationInterval', intervalE);
      formData.append('unit', unit);
      formData.append('accuracyClass', instrument.accuracyClass || 'CLASS_III');
      formData.append('saveToDatabase', 'false'); // Preview only initially

      const res = await apiClient.post('/batch/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        setPreviewData(res.data.data);
        toast.success(`Parsed ${res.data.data.totalPoints} calibration load points.`);
      } else {
        toast.error(res.data?.message || 'Error processing calibration CSV');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to parse calibration CSV file.';
      toast.error(msg);
      setPreviewData(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Download sample 10-point CSV template
   */
  const handleDownloadTemplate = async () => {
    try {
      const url = `/api/batch/template-csv?maxCapacity=${maxCap}&e=${intervalE}&unit=${unit}&model=${encodeURIComponent(instrument.model || 'Weighbridge')}`;
      window.open(url, '_blank');
      toast.success('Downloaded 10-Point Weighbridge Calibration Template');
    } catch (err) {
      toast.error('Error downloading template');
    }
  };

  /**
   * Confirm and Apply Batch Data to Active Test Table
   */
  const handleApplyImport = async (saveDirectly = false) => {
    if (!previewData || !previewData.points) return;

    try {
      if (saveDirectly && sessionId) {
        setIsLoading(true);
        // Save to DB via backend
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('sessionId', sessionId);
        formData.append('saveToDatabase', 'true');

        await apiClient.post('/batch/import-csv', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('Weighbridge calibration series imported & saved to database!');
      }

      if (onImportSuccess) {
        onImportSuccess(previewData);
      }

      onClose();
    } catch (err) {
      toast.error('Error saving imported calibration series.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={containerRef}
        {...dialogProps}
        aria-labelledby="batch-csv-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden focus:outline-none"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary-100 text-primary-700 rounded-xl">
              <FiLayers className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="batch-csv-modal-title" className="text-base font-bold text-slate-900">
                Batch CSV Weighbridge Calibration Import Engine
              </h2>
              <p className="text-xs text-slate-500">
                High-throughput 10-point linearity data import with OIML R-76 turning-point error calculation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <FiX className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Top Info & Download Template Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 text-blue-900">
            <div>
              <span className="font-bold">Target Instrument: </span>
              <span>{instrument.model || 'Electronic Weighbridge'} | Max: {maxCap.toLocaleString()} {unit} | e: {intervalE} {unit}</span>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 font-bold border border-blue-300 rounded-lg shadow-sm transition-colors"
            >
              <FiDownload className="w-3.5 h-3.5" />
              <span>Download 10-Point CSV Template</span>
            </button>
          </div>

          {/* Drag and Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload weighbridge calibration CSV file. Activate to browse, or drag and drop a file here."
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              isDragging
                ? 'border-primary-500 bg-primary-50/50 scale-[0.99]'
                : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileChange}
              className="hidden"
              tabIndex={-1}
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-primary-50 text-primary-600 rounded-full">
                <FiUploadCloud className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="font-bold text-slate-800">
                {selectedFile ? selectedFile.name : 'Click or Drag & Drop Weighbridge Calibration CSV'}
              </div>
              <p className="text-slate-400 text-[11px]">
                Supports wide format (Load, IndicatedInc, IndicatedDec, DeltaL) or long format.
              </p>
            </div>
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div role="status" className="py-8 text-center text-slate-500">
              <div
                className="inline-block w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-2"
                aria-hidden="true"
              />
              <p className="font-semibold">Calculating metrological turning-point errors and MPE envelopes...</p>
            </div>
          )}

          {/* Parsed Preview Table & Statistics */}
          {previewData && !isLoading && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Load Points</span>
                  <span className="text-lg font-black text-slate-900">{previewData.totalPoints}</span>
                </div>

                <div className={`rounded-xl p-3 border ${
                  previewData.overallPass ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                }`}>
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">MPE Compliance</span>
                  <div className="flex items-center gap-1.5">
                    {previewData.overallPass ? (
                      <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <FiAlertTriangle className="w-4 h-4 text-rose-600" />
                    )}
                    <span className={`text-base font-black ${previewData.overallPass ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {previewData.overallPass ? '100% PASS' : `${previewData.failedPoints} FAILED`}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Max Corrected Error (Ec)</span>
                  <span className="text-base font-black text-slate-900">
                    {previewData.maxCorrectedError > 0 ? `+${previewData.maxCorrectedError}` : previewData.maxCorrectedError} {unit}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Max Hysteresis</span>
                  <span className="text-base font-black text-slate-900">
                    {previewData.maxHysteresis} {unit}
                  </span>
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-[11px] text-slate-700">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Point</th>
                        <th className="px-3 py-2">Applied Load</th>
                        <th className="px-3 py-2">Inc Indication (I)</th>
                        <th className="px-3 py-2">Inc Error (Ec)</th>
                        <th className="px-3 py-2">Dec Indication (I)</th>
                        <th className="px-3 py-2">Dec Error (Ec)</th>
                        <th className="px-3 py-2">Hysteresis</th>
                        <th className="px-3 py-2">MPE (±)</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {previewData.points.map((pt, idx) => (
                        <tr key={idx} className={`hover:bg-slate-50 ${!pt.passed ? 'bg-rose-50/40' : ''}`}>
                          <td className="px-3 py-2 font-bold font-sans">{pt.percentMax}%</td>
                          <td className="px-3 py-2 font-bold">{pt.appliedLoad} {unit}</td>
                          <td className="px-3 py-2">{pt.incReading}</td>
                          <td className={`px-3 py-2 font-bold ${pt.incPass ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {pt.correctedErrorInc > 0 ? `+${pt.correctedErrorInc}` : pt.correctedErrorInc}
                          </td>
                          <td className="px-3 py-2">{pt.decReading}</td>
                          <td className={`px-3 py-2 font-bold ${pt.decPass ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {pt.correctedErrorDec > 0 ? `+${pt.correctedErrorDec}` : pt.correctedErrorDec}
                          </td>
                          <td className={`px-3 py-2 font-bold ${pt.hysPass ? 'text-slate-800' : 'text-rose-600'}`}>
                            {pt.hysteresis}
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-500">±{pt.mpeAbsolute}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pt.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {pt.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>

          {previewData && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyImport(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
              >
                <FiArrowRight className="w-4 h-4" />
                <span>Populate Test Table</span>
              </button>

              {sessionId && (
                <button
                  type="button"
                  onClick={() => handleApplyImport(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
                >
                  <FiCheck className="w-4 h-4" />
                  <span>Import & Save Directly</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
