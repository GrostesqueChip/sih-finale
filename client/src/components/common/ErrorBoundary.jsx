import React, { Component } from 'react';
import StateEmblem from './StateEmblem';

/**
 * Official Government Portal Error Boundary for NAWI-ReportPro
 * Conforms to GIGW 3.0 Guidelines for graceful error handling and recovery.
 * Provides accessible error diagnostics and multiple recovery pathways for field officers.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log exception for audit diagnostics
    console.error('[NAWI-ReportPro ErrorBoundary] Uncaught exception:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    // Clear the error and actually navigate to the dashboard. This is a class
    // component outside the Router, so we use a hard navigation.
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.assign('/dashboard');
  };

  handleClearAndRelogin = () => {
    try {
      // Use the real auth storage keys (AuthContext persists under
      // nawi_auth_token / nawi_auth_user); the previous 'token'/'user' keys
      // never existed, so the session was never actually cleared.
      localStorage.removeItem('nawi_auth_token');
      localStorage.removeItem('nawi_auth_user');
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.assign('/login');
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails } = this.state;
      const timestamp = new Date().toISOString();

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-800 font-sans">
          {/* Top National Header */}
          <header className="bg-[#1e3a5f] text-white shadow-md border-b-4 border-[#FF9933]">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <StateEmblem size="sm" color="#ffffff" showMotto={false} />
                <div>
                  <div className="text-xs font-semibold tracking-wider text-amber-300">
                    भारत सरकार | GOVERNMENT OF INDIA
                  </div>
                  <div className="text-sm md:text-base font-bold text-white leading-tight">
                    उपभोक्ता मामले, खाद्य एवं सार्वजनिक वितरण मंत्रालय
                  </div>
                  <div className="text-xs text-slate-200">
                    Ministry of Consumer Affairs, Food & Public Distribution | Legal Metrology Portal
                  </div>
                </div>
              </div>
              <div className="hidden sm:block text-right">
                <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded bg-red-700/80 text-white border border-red-400/40">
                  सत्र त्रुटि | System Exception
                </span>
              </div>
            </div>
            {/* Tricolor Sub-bar */}
            <div className="h-1 w-full flex">
              <div className="w-1/3 bg-[#FF9933]"></div>
              <div className="w-1/3 bg-white"></div>
              <div className="w-1/3 bg-[#138808]"></div>
            </div>
          </header>

          {/* Main Error Recovery Container */}
          <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 flex flex-col justify-center">
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white px-6 py-4 flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg md:text-xl font-bold tracking-tight">
                    तकनीकी त्रुटि उत्पन्न हुई | Technical Error Encountered
                  </h1>
                  <p className="text-xs md:text-sm text-red-100">
                    The metrological application experienced an unexpected runtime fault.
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r text-sm text-amber-900">
                  <p className="font-semibold mb-1">
                    अधिकारियों एवं उपयोगकर्ताओं के लिए सूचना (Notice to Officers):
                  </p>
                  <p className="text-xs md:text-sm leading-relaxed">
                    Your current inspection session state has been preserved locally where possible. Please select one of the recovery actions below to resume operations. If this condition persists during an official field verification, please notify your Legal Metrology Systems Administrator.
                  </p>
                </div>

                {/* Error Summary */}
                <div className="bg-slate-50 border border-slate-200 rounded p-4 text-xs font-mono text-slate-700 space-y-1">
                  <div><span className="font-bold text-slate-900">Incident Timestamp:</span> {timestamp}</div>
                  <div><span className="font-bold text-slate-900">Exception Message:</span> {error?.message || 'Unknown Exception'}</div>
                </div>

                {/* Recovery Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={this.handleReset}
                    className="flex items-center justify-center px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#152842] text-white text-xs md:text-sm font-medium rounded shadow transition focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:ring-offset-2"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    पुनः प्रयास करें / Retry
                  </button>

                  <button
                    type="button"
                    onClick={this.handleReload}
                    className="flex items-center justify-center px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white text-xs md:text-sm font-medium rounded shadow transition focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    रिफ्रेश / Reload Page
                  </button>

                  <button
                    type="button"
                    onClick={this.handleGoHome}
                    className="flex items-center justify-center px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs md:text-sm font-medium rounded shadow transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    डैशबोर्ड / Dashboard
                  </button>

                  <button
                    type="button"
                    onClick={this.handleClearAndRelogin}
                    className="flex items-center justify-center px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs md:text-sm font-medium rounded shadow transition focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    लॉगआउट / Re-login
                  </button>
                </div>

                {/* Diagnostics Toggle */}
                <div className="pt-2 border-t border-slate-200">
                  {import.meta.env.DEV && (
                    <>
                      <button
                        type="button"
                        onClick={this.toggleDetails}
                        className="text-xs text-slate-500 hover:text-slate-800 underline focus:outline-none flex items-center space-x-1"
                      >
                        <span>{showDetails ? 'छिपाएं' : 'तकनीकी विवरण देखें'} (Toggle Technical Stack Details)</span>
                      </button>

                      {showDetails && (
                        <div className="mt-3 p-3 bg-slate-900 text-emerald-400 rounded text-xs font-mono overflow-auto max-h-60 space-y-2">
                          <div>
                            <div className="text-slate-400 font-bold border-b border-slate-700 pb-1 mb-1">Stack Trace:</div>
                            <pre className="whitespace-pre-wrap">{error?.stack || 'No stack trace available'}</pre>
                          </div>
                          {errorInfo?.componentStack && (
                            <div>
                              <div className="text-slate-400 font-bold border-b border-slate-700 pb-1 mb-1">Component Stack:</div>
                              <pre className="whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </main>

          {/* Standard Portal Footer */}
          <footer className="bg-slate-800 text-slate-300 text-xs py-4 border-t border-slate-700">
            <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0 text-center sm:text-left">
              <div>
                © 2026 विधिक मापविज्ञान प्रभाग, उपभोक्ता मामले विभाग | Legal Metrology Division, DoCA
              </div>
              <div className="text-slate-400">
                GIGW 3.0 Compliant | OIML R-76 Verification Platform
              </div>
            </div>
          </footer>
        </div>
      );
    }

    return this.props.children;
  }
}
