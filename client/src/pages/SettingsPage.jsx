import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiSave, FiSettings, FiCheckCircle, FiInfo, FiRefreshCw } from 'react-icons/fi';

import PageHeader from '../components/shared/PageHeader';

const SETTINGS_STORAGE_KEY = 'nawi_settings';

// Only the organization-header fields are user-editable local preferences.
// Environmental defaults and the security toggles were removed: the former had
// no UI fields, and the latter implied client control over server-enforced
// integrity checks (see the read-only security section below).
const DEFAULT_SETTINGS = {
  ministryName: 'Ministry of Consumer Affairs, Food & Public Distribution',
  departmentName: 'Department of Legal Metrology',
  standardReference: 'Legal Metrology (General) Rules, 2011 / OIML R-76:2006',
};

export default function SettingsPage() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (err) {
      console.warn('Failed to parse nawi_settings from localStorage:', err);
    }
    return DEFAULT_SETTINGS;
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      toast.success(t('settings.savedSuccess', 'Settings saved to browser storage successfully'));
    } catch (err) {
      toast.error('Failed to save settings to localStorage');
    }
  };

  const handleResetDefaults = () => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      setSettings(DEFAULT_SETTINGS);
      toast.success(t('settings.resetSuccess', 'Settings successfully reset to official defaults'));
    } catch (err) {
      toast.error('Failed to reset settings in localStorage');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={t('settings.title', 'System Settings & Metrology Standards')}
        subtitle={t(
          'settings.subtitle',
          'Configure organization parameters, OIML R-76 standard tolerances, and inspection defaults'
        )}
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Organization Configuration */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2">
            {t('settings.organization', 'Department Configuration')}
          </h2>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="ministryName"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                Ministry Header Title
              </label>
              <input
                id="ministryName"
                type="text"
                name="ministryName"
                value={settings.ministryName}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-primary-500 font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="departmentName"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                Department / Wing Title
              </label>
              <input
                id="departmentName"
                type="text"
                name="departmentName"
                value={settings.departmentName}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-primary-500 font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="standardReference"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                Statutory Regulatory Reference
              </label>
              <input
                id="standardReference"
                type="text"
                name="standardReference"
                value={settings.standardReference}
                onChange={handleChange}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* OIML Standards Matrix */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-[#1e3a5f]">
              {t('settings.standards', 'OIML R-76 Standards Matrix')}
            </h2>
            <span className="text-[11px] text-slate-500">
              Active Maximum Permissible Error (MPE) envelopes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-y border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Zone 1 (±0.5e)</th>
                  <th className="px-3 py-2">Zone 2 (±1.0e)</th>
                  <th className="px-3 py-2">Zone 3 (±1.5e)</th>
                  <th className="px-3 py-2">Min Scale Units (n_min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="px-3 py-2 font-bold font-sans">Class I (Special)</td>
                  <td className="px-3 py-2">0 ≤ m ≤ 50,000e</td>
                  <td className="px-3 py-2">50,000e &lt; m ≤ 200,000e</td>
                  <td className="px-3 py-2">m &gt; 200,000e</td>
                  <td className="px-3 py-2 font-sans">50,000</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-bold font-sans">Class II (High)</td>
                  <td className="px-3 py-2">0 ≤ m ≤ 5,000e</td>
                  <td className="px-3 py-2">5,000e &lt; m ≤ 20,000e</td>
                  <td className="px-3 py-2">20,000e &lt; m ≤ 100,000e</td>
                  <td className="px-3 py-2 font-sans">5,000</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-bold font-sans">Class III (Medium)</td>
                  <td className="px-3 py-2">0 ≤ m ≤ 500e</td>
                  <td className="px-3 py-2">500e &lt; m ≤ 2,000e</td>
                  <td className="px-3 py-2">2,000e &lt; m ≤ 10,000e</td>
                  <td className="px-3 py-2 font-sans">500</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-bold font-sans">Class IIII (Ordinary)</td>
                  <td className="px-3 py-2">0 ≤ m ≤ 50e</td>
                  <td className="px-3 py-2">50e &lt; m ≤ 200e</td>
                  <td className="px-3 py-2">200e &lt; m ≤ 1,000e</td>
                  <td className="px-3 py-2 font-sans">100</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Security & Integrity Settings — server-enforced, shown read-only */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-[#1e3a5f] border-b border-slate-100 pb-2">
            Audit Trail & Cryptographic Security
          </h2>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded flex items-start gap-2.5">
            <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-900 leading-relaxed">
              These integrity controls are enforced unconditionally on the server for every
              request and cannot be disabled from this screen. They are shown here for
              transparency, not as client-side switches.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">
                  Continuous SHA-256 Audit Chain Verification
                  <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded align-middle">
                    Always On
                  </span>
                </span>
                <span className="text-slate-500">
                  The server chains every audit block by hash; finalization requests are rejected
                  if the chain does not validate.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">
                  Mandatory Legal Metrology Officer Sign-off
                  <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded align-middle">
                    Always On
                  </span>
                </span>
                <span className="text-slate-500">
                  Role-restricted routes require authorized inspector or admin credentials to issue
                  official verification seals.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            <span>{t('settings.resetDefaults', 'Reset to Defaults')}</span>
          </button>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors shadow-sm"
          >
            <FiSave className="w-3.5 h-3.5" />
            <span>{t('common.save', 'Save Settings')}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
