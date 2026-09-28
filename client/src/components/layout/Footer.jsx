import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiExternalLink,
  FiShield,
  FiUsers,
  FiClock,
  FiCheckCircle,
  FiFileText,
  FiX,
  FiInfo,
} from 'react-icons/fi';
import StateEmblem from '../common/StateEmblem';

// Real build timestamp injected by Vite (see vite.config.js). Falls back to
// runtime "now" if the define is somehow absent, so we never show a stale
// hardcoded date.
const BUILD_TS = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : null;

export default function Footer() {
  const { t, i18n } = useTranslation();
  const [activeModal, setActiveModal] = useState(null);

  const lastUpdatedDate = BUILD_TS ? new Date(BUILD_TS) : new Date();
  const lastUpdated = Number.isNaN(lastUpdatedDate.getTime())
    ? '—'
    : lastUpdatedDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  const statutoryLinks = [
    {
      id: 'rti',
      titleEn: 'Right to Information (RTI)',
      titleHi: 'सूचना का अधिकार (आरटीआई)',
      externalUrl: 'https://rti.gov.in',
      summary:
        'Under the Right to Information Act, 2005, citizens can seek information regarding legal metrology verification rules, standards, fees, and test procedures conducted under the Legal Metrology Act, 2009.',
    },
    {
      id: 'cpgrams',
      titleEn: 'Grievances (CPGRAMS)',
      titleHi: 'लोक शिकायत (सीपीजीआरएएमएस)',
      externalUrl: 'https://pgportal.gov.in',
      summary:
        'Submit appeals or grievances relating to weights and measures verifications, calibration irregularities, or consumer disputes to the Centralised Public Grievance Redress and Monitoring System.',
    },
    {
      id: 'terms',
      titleEn: 'Terms & Conditions',
      titleHi: 'नियम और शर्तें',
      summary:
        'This portal is designed for authorized Legal Metrology officers and verified commercial establishments. Tampering with digital seals or test sessions is punishable under Sections 25 and 53 of the Legal Metrology Act, 2009.',
    },
    {
      id: 'privacy',
      titleEn: 'Privacy Policy',
      titleHi: 'गोपनीयता नीति',
      summary:
        'We adhere to standard Government of India data privacy guidelines. Test sessions, calibration logs, and biometric/token signatures are encrypted and retained strictly for statutory metrological audit trails.',
    },
    {
      id: 'hyperlink',
      titleEn: 'Hyperlinking Policy',
      titleHi: 'हाइपरलिंकिंग नीति',
      summary:
        'Prior permission is not required to link directly to this portal. However, pages must load into a full newly opened window and not within frames on third-party sites.',
    },
    {
      id: 'copyright',
      titleEn: 'Copyright Policy',
      titleHi: 'कॉपीराइट नीति',
      summary:
        'Material featured on this site may be reproduced for official verification purposes with proper attribution to the Department of Legal Metrology, Government of India.',
    },
  ];

  return (
    <footer className="bg-[#1e293b] text-slate-300 text-xs mt-auto border-t border-slate-700">
      {/* Top Tricolor Strip */}
      <div className="flex h-1 w-full">
        <div className="w-1/3 bg-[#FF9933]" />
        <div className="w-1/3 bg-white" />
        <div className="w-1/3 bg-[#138808]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Col 1: Ministry Hierarchy & Emblem */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <StateEmblem size="sm" color="#ffffff" className="mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  भारत सरकार | Govt. of India
                </p>
                <p className="text-xs font-bold text-white leading-snug">
                  उपभोक्ता मामले, खाद्य और सार्वजनिक वितरण मंत्रालय
                </p>
                <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                  Ministry of Consumer Affairs, Food & Public Distribution
                </p>
                <p className="text-[10px] text-amber-400 font-semibold mt-1">
                  विधिक मापविज्ञान प्रभाग | Legal Metrology Division
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
              National Digital Verification & Test Report Management System for Non-Automatic Weighing Instruments (NAWI) conforming to OIML R-76 standards.
            </p>
          </div>

          {/* Col 2: Statutory & Essential Links */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-700 pb-1.5 flex items-center gap-1.5">
              <FiShield className="text-emerald-400 w-3.5 h-3.5" />
              <span>Statutory Governance</span>
            </h4>
            <ul className="space-y-1.5 text-[11px]">
              {statutoryLinks.slice(0, 4).map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => setActiveModal(link)}
                    className="hover:text-amber-400 transition-colors flex items-center gap-1 text-left"
                  >
                    <span>›</span>
                    <span>{i18n.language === 'hi' ? link.titleHi : link.titleEn}</span>
                    {link.externalUrl && <FiExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Technical Credits & Standards */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-700 pb-1.5 flex items-center gap-1.5">
              <FiFileText className="text-blue-400 w-3.5 h-3.5" />
              <span>Technical & SIH 2026 Credits</span>
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Designed, Developed & Maintained for the <span className="text-white font-semibold">Smart India Hackathon 2026</span> (Problem Statement ID: <span className="text-amber-400 font-mono font-bold">26035</span>).
            </p>
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/80 space-y-1 text-[10px]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <FiCheckCircle className="w-3 h-3" />
                <span>Designed in compliance with GIGW 3.0 draft specifications</span>
              </div>
              <p className="text-slate-400">
                Deployment Environment: SIH 2026 Prototype
              </p>
              <p className="text-slate-400">
                Standards: OIML R-76 (2006/E) & ISO/IEC 17025:2017
              </p>
            </div>
          </div>

          {/* Col 4: Dynamic Metrics & Portal Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white border-b border-slate-700 pb-1.5 flex items-center gap-1.5">
              <FiClock className="text-amber-400 w-3.5 h-3.5" />
              <span>Portal Metrics & Status</span>
            </h4>

            {/* Dynamic Visitor Counter */}
            <div className="bg-slate-900 p-2.5 rounded border border-slate-700">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <FiUsers className="w-3 h-3 text-emerald-400" />
                  <span><span className="text-slate-400 text-xs">Session Active</span></span>
                </span>
              </div>
            </div>

            {/* Last Updated Timestamp */}
            <div className="text-[10px] text-slate-400 space-y-0.5">
              <div className="flex items-center gap-1 text-slate-300">
                <FiClock className="w-3 h-3 text-blue-400" />
                <span className="font-semibold">अंतिम अद्यतन / Last Updated:</span>
              </div>
              <p className="font-mono text-slate-400 pl-4">{lastUpdated}</p>
            </div>
          </div>
        </div>

        {/* Bottom Legal Copyright & Attributions */}
        <div className="pt-6 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400 text-center sm:text-left">
          <div>
            <p>
              © {new Date().getFullYear()} विधिक मापविज्ञान प्रभाग, उपभोक्ता मामले, खाद्य और सार्वजनिक वितरण मंत्रालय, भारत सरकार।
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Website Content Managed and Owned by Legal Metrology Division, Ministry of Consumer Affairs, Food & Public Distribution, Government of India.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            {statutoryLinks.slice(4).map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => setActiveModal(link)}
                className="hover:text-amber-400 transition-colors underline underline-offset-2"
              >
                {i18n.language === 'hi' ? link.titleHi : link.titleEn}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Statutory Policy Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 rounded-lg shadow-2xl border border-slate-300 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-bold text-[#1e3a5f] uppercase tracking-wider">
                  Government of India • Statutory Notice
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {i18n.language === 'hi' ? activeModal.titleHi : activeModal.titleEn}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close dialog"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed space-y-2 bg-slate-50 p-3.5 rounded border border-slate-200">
              <p>{activeModal.summary}</p>
              {activeModal.externalUrl && (
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Official National Portal:</span>
                  <a
                    href={activeModal.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-900 hover:underline"
                  >
                    <span>Visit {activeModal.externalUrl.replace('https://', '')}</span>
                    <FiExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e3a5f] hover:bg-[#152843] rounded transition-colors shadow-sm"
              >
                Close / बंद करें
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
