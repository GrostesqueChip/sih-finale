import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import StateEmblem from '../components/common/StateEmblem';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg(t('common.requiredField', 'Please provide both email and password'));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await login(email, password);
      toast.success(t('common.success', 'Signed in successfully'));
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        t('auth.invalidCredentials', 'Invalid email or password');
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const setCredentials = async (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setErrorMsg('');
    try {
      setIsSubmitting(true);
      await login(demoEmail, demoPassword);
      toast.success(t('common.success', 'Signed in successfully'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        t('auth.invalidCredentials', 'Invalid email or password');
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-surface-100 text-slate-800">
      {/* Top Gov Stripe */}
      <div className="h-1.5 bg-saffron-500 w-full" />

      {/* Main Login Box */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-sm p-8">
          {/* Header & National Emblem Symbol */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-3">
              <StateEmblem size="lg" showMotto={false} />
            </div>
            <h1 className="text-2xl font-extrabold text-[#1e3a5f] tracking-tight">
              NAWI-ReportPro
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">
              {t('common.portalTitle', 'Test Report Management System')}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              OIML R-76 Legal Metrology Verification
            </p>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                {t('auth.emailLabel', 'Email Address / Officer ID')}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder', 'officer@gov.in')}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-800"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
              >
                {t('auth.passwordLabel', 'Password')}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm rounded shadow-sm transition-colors disabled:opacity-60 mt-2"
            >
              {isSubmitting
                ? t('auth.signingIn', 'Signing In...')
                : t('auth.signInBtn', 'Sign In')}
            </button>
          </form>

          {/* Quick Demo Logins for evaluators */}
          {/* Demo Mode Indicator */}
          <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded flex items-center gap-2">
            <span className="text-amber-600 text-sm">⚠️</span>
            <p className="text-[11px] text-amber-800 font-semibold">
              DEMO / EVALUATION MODE — Sample data for hackathon demonstration. Not for production use.
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
              Quick Officer Sign-In
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCredentials('admin@nawi.gov.in', 'Admin@123')}
                className="px-2 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-center truncate"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setCredentials('inspector@nawi.gov.in', 'Inspector@123')}
                className="px-2 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-center truncate"
              >
                Inspector
              </button>
              <button
                type="button"
                onClick={() => setCredentials('viewer@nawi.gov.in', 'Viewer@123')}
                className="px-2 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-center truncate"
              >
                Auditor
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        <p className="font-semibold text-slate-700">
          {t('common.ministry', 'Ministry of Consumer Affairs, Food & Public Distribution')}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {t('common.govOfIndia', 'Government of India')} | OIML R-76 Compliance System
        </p>
      </footer>
    </div>
  );
}
