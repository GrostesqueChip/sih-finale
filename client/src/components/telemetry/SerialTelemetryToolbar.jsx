import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiRadio,
  FiZap,
  FiZapOff,
  FiRefreshCw,
  FiCpu,
  FiChevronDown,
  FiChevronUp,
  FiTerminal,
  FiSliders,
  FiCornerDownLeft,
  FiCheckCircle,
  FiAlertCircle,
  FiShield,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import apiClient from '../../hooks/useApi';

/**
 * Protocol Definitions
 */
export const PROTOCOLS = [
  { id: 'METTLER_SICS', name: 'Mettler Toledo SICS', baud: '9600 8-N-1', desc: 'Standard Interface Command Set (S S, S D, Z, T)' },
  { id: 'AVERY_WEIGH_TRONIX', name: 'Avery Weigh-Tronix', baud: '9600 8-N-1', desc: 'Continuous ASCII Frame (<STX><STATUS><WEIGHT><CR><LF>)' },
  { id: 'ESSAE', name: 'Essae / Teraoka', baud: '9600 8-N-1', desc: 'Weighbridge Indicator Protocol (<STX><POL><WEIGHT><STAT><ETX>)' },
];

/**
 * SerialTelemetryToolbar Component
 * Real-time digital indicator display with Web Serial API + Mock SSE Stream Fallback,
 * protocol switching, stability lock, zero tracking, and single-click weight capture.
 */
export default function SerialTelemetryToolbar({
  instrument = {},
  onCaptureReading = null,
  activeTargetLoad = null,
  className = '',
}) {
  const maxCap = Number(instrument.maxCapacity) || 100000;
  const intervalE = Number(instrument.verificationInterval || instrument.verificationScaleInterval_e) || 20;
  const intervalD = Number(instrument.actualInterval || instrument.actualScaleInterval_d) || intervalE;
  const unit = instrument.unit || 'kg';

  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState('SIMULATOR_SSE'); // 'WEB_SERIAL' | 'SIMULATOR_SSE'
  const [protocol, setProtocol] = useState('METTLER_SICS');

  // Metrological State
  const [liveWeight, setLiveWeight] = useState(0);
  const [grossWeight, setGrossWeight] = useState(0);
  const [tareWeight, setTareWeight] = useState(0);
  const [isTareActive, setIsTareActive] = useState(false);
  const [isStable, setIsStable] = useState(true);
  const [isCenterOfZero, setIsCenterOfZero] = useState(true);
  const [isOverload, setIsOverload] = useState(false);
  const [rawAscii, setRawAscii] = useState('S S       0.00 kg\r\n');
  const [rawHex, setRawHex] = useState('53 20 53 20 20 20 20 20 20 20 30 2E 30 30 20 6B 67 0D 0A');

  // UI / Controls State
  const [showInspector, setShowInspector] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [simTargetLoad, setSimTargetLoad] = useState(0);
  const [noiseLevel, setNoiseLevel] = useState(0.05);

  // Web Serial Port Ref
  const serialPortRef = useRef(null);
  const serialReaderRef = useRef(null);
  const eventSourceRef = useRef(null);

  // -------------------------------------------------------------
  // SSE SIMULATOR STREAM CONNECTION
  // -------------------------------------------------------------
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sseUrl = `/api/telemetry/stream?protocol=${protocol}&targetWeight=${simTargetLoad}&noise=${noiseLevel}&unit=${unit}&maxCapacity=${maxCap}&e=${intervalE}&d=${intervalD}`;
    const es = new EventSource(sseUrl);

    es.onopen = () => {
      setIsConnected(true);
      setConnectionMode('SIMULATOR_SSE');
      toast.success(`Connected to ${protocol} Telemetry Stream`, { id: 'telemetry-conn' });
    };

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.weight !== undefined) {
          setLiveWeight(payload.weight);
          setGrossWeight(payload.grossWeight ?? payload.weight);
          setTareWeight(payload.tareWeight || 0);
          setIsTareActive(Boolean(payload.isNet));
          setIsStable(Boolean(payload.isStable));
          setIsCenterOfZero(Boolean(payload.isZero));
          setIsOverload(Boolean(payload.isOverload));
          if (payload.rawAscii) setRawAscii(payload.rawAscii);
          if (payload.rawHex) setRawHex(payload.rawHex);
        }
      } catch (err) {
        // SSE heartbeat / comment
      }
    };

    es.onerror = () => {
      // Reconnection handled automatically by browser
    };

    eventSourceRef.current = es;
  }, [protocol, simTargetLoad, noiseLevel, unit, maxCap, intervalE, intervalD]);

  // -------------------------------------------------------------
  // WEB SERIAL API CONNECTION (Physical RS-232 / USB FTDI Dongle)
  // -------------------------------------------------------------
  const connectWebSerial = async () => {
    if (!('serial' in navigator)) {
      toast.error('Web Serial API is not supported in this browser. Connecting to High-Precision Simulator fallback.');
      connectSSE();
      return;
    }

    try {
      // Request serial port
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
      serialPortRef.current = port;

      setIsConnected(true);
      setConnectionMode('WEB_SERIAL');
      toast.success('Connected to physical RS-232 COM Port (9600 8-N-1)');

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      serialReaderRef.current = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/[\r\n]+/);
          buffer = lines.pop(); // keep remainder

          for (const line of lines) {
            if (!line.trim()) continue;
            parseRawSerialFrame(line);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        toast.error(`Serial connection error: ${err.message}`);
      }
      // Fallback to simulator
      disconnect();
    }
  };

  /**
   * Parse incoming raw serial ASCII packet from physical indicator
   */
  const parseRawSerialFrame = (line) => {
    setRawAscii(line);
    // Convert to hex
    const hex = Array.from(line)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    setRawHex(hex);

    // Parse according to selected protocol
    if (protocol === 'METTLER_SICS') {
      // "S S   120.00 kg" or "S D   120.00 kg"
      const match = line.match(/^S\s+([SD])\s+([+-]?\s*[\d.]+)/);
      if (match) {
        setIsStable(match[1] === 'S');
        const val = parseFloat(match[2].replace(/\s+/g, ''));
        if (!isNaN(val)) {
          setLiveWeight(val);
          setIsCenterOfZero(val === 0);
        }
      }
    } else if (protocol === 'AVERY_WEIGH_TRONIX') {
      // <STX><STATUS><POLARITY><WEIGHT>
      const clean = line.replace(/[\x02\x03]/g, '');
      const match = clean.match(/([ MZ])([ +-])([\d.\s]+)/);
      if (match) {
        setIsStable(match[1] !== 'M');
        setIsCenterOfZero(match[1] === 'Z');
        const sign = match[2] === '-' ? -1 : 1;
        const val = sign * parseFloat(match[3].trim());
        if (!isNaN(val)) setLiveWeight(val);
      }
    } else if (protocol === 'ESSAE') {
      // <STX><POLARITY><WEIGHT><STATUS><ETX>
      const clean = line.replace(/[\x02\x03]/g, '');
      const match = clean.match(/([+-])(\d+)([SUZ])/);
      if (match) {
        const sign = match[1] === '-' ? -1 : 1;
        setIsStable(match[3] === 'S' || match[3] === 'Z');
        setIsCenterOfZero(match[3] === 'Z');
        const digits = match[2];
        const val = (sign * parseFloat(digits)) / 100;
        if (!isNaN(val)) setLiveWeight(val);
      }
    } else {
      // Generic numeric extract
      const nums = line.match(/[+-]?\d+(\.\d+)?/);
      if (nums) {
        const val = parseFloat(nums[0]);
        if (!isNaN(val)) setLiveWeight(val);
      }
    }
  };

  /**
   * Disconnect telemetry stream
   */
  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (serialReaderRef.current) {
      try {
        serialReaderRef.current.cancel();
      } catch (e) {}
      serialReaderRef.current = null;
    }
    if (serialPortRef.current) {
      try {
        serialPortRef.current.close();
      } catch (e) {}
      serialPortRef.current = null;
    }
    setIsConnected(false);
    toast('Telemetry connection closed', { icon: '🔌' });
  };

  /**
   * Send Zero command
   */
  const handleZero = async () => {
    try {
      const res = await apiClient.post('/telemetry/zero');
      if (res.data?.success) {
        toast.success('Indicator zero set (>0<)', { icon: '🎯' });
      } else {
        toast.error(res.data?.message || 'Failed to zero indicator');
      }
    } catch (err) {
      toast.error('Error zeroing scale');
    }
  };

  /**
   * Send Tare command
   */
  const handleTare = async () => {
    try {
      const res = await apiClient.post('/telemetry/tare');
      if (res.data?.success) {
        toast.success(res.data.message || 'Tare locked', { icon: '⚖️' });
      } else {
        toast.error(res.data?.message || 'Failed to tare');
      }
    } catch (err) {
      toast.error('Error taring scale');
    }
  };

  /**
   * Clear active tare
   */
  const handleClearTare = async () => {
    try {
      await apiClient.post('/telemetry/clear-tare');
      toast.success('Tare cleared');
    } catch (err) {
      toast.error('Error clearing tare');
    }
  };

  /**
   * Set simulated target load
   */
  const handleSetTargetLoad = async (weight) => {
    const num = Math.max(0, Number(weight) || 0);
    setSimTargetLoad(num);
    try {
      await apiClient.post('/telemetry/set-weight', { weight: num });
    } catch (e) {}
  };

  /**
   * Switch protocol
   */
  const handleProtocolChange = async (newProto) => {
    setProtocol(newProto);
    try {
      await apiClient.post('/telemetry/config', { protocol: newProto });
      if (isConnected && connectionMode === 'SIMULATOR_SSE') {
        connectSSE();
      }
      toast.success(`Protocol switched to ${newProto}`);
    } catch (e) {}
  };

  /**
   * Capture active weight into test table
   */
  const handleCapture = () => {
    if (isOverload) {
      toast.error('Cannot capture reading during OVERLOAD condition!');
      return;
    }
    if (!isStable) {
      toast('Capturing reading during MOTION state', { icon: '⚠️' });
    }
    if (onCaptureReading) {
      onCaptureReading({
        weight: liveWeight,
        gross: grossWeight,
        tare: tareWeight,
        isStable,
        unit,
        protocol,
        timestamp: new Date().toISOString(),
      });
      toast.success(`Captured: ${liveWeight} ${unit}`, { icon: '📥' });
    } else {
      toast.success(`Live Weight: ${liveWeight} ${unit} (No active row selected)`);
    }
  };

  // Sync active target load when prop changes
  useEffect(() => {
    if (activeTargetLoad !== null && activeTargetLoad !== undefined && isConnected) {
      handleSetTargetLoad(activeTargetLoad);
    }
  }, [activeTargetLoad, isConnected]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (serialReaderRef.current) {
        try {
          serialReaderRef.current.cancel();
        } catch (e) {}
      }
    };
  }, []);

  return (
    <div className={`bg-slate-900 border border-slate-800 text-white rounded-xl shadow-lg overflow-hidden ${className}`}>
      {/* Top Header Bar */}
      <div className="bg-slate-950 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-primary-500/10 border border-primary-500/30 rounded-lg text-primary-400">
            <FiRadio className={`w-4 h-4 ${isConnected ? 'animate-pulse text-emerald-400' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className="font-bold text-xs flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span>Interactive RS-232 Weighbridge Simulator (Virtual Test Mode)</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                  isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                }`}>
                  {isConnected ? (connectionMode === 'WEB_SERIAL' ? 'HARDWARE COM PORT [ONLINE]' : 'SIMULATOR MODE [ACTIVE]') : 'OFFLINE'}
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] px-2 py-0.5 rounded flex items-center gap-1 w-fit mt-0.5">
                <span>⚠️</span>
                <span>Simulated data — not connected to physical hardware</span>
              </div>
            </div>
          </div>
        </div>

        {/* Protocol Selector & Connection Buttons */}
        <div className="flex items-center gap-2">
          {/* Protocol dropdown */}
          <select
            value={protocol}
            onChange={(e) => handleProtocolChange(e.target.value)}
            aria-label="Weighing indicator serial protocol"
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:ring-1 focus:ring-primary-500 focus:outline-none"
          >
            {PROTOCOLS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Connect / Disconnect Buttons */}
          {!isConnected ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={connectSSE}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                title="Start Real-time Indicator Telemetry Stream"
              >
                <FiZap className="w-3.5 h-3.5" />
                <span>Start Stream</span>
              </button>

              {'serial' in navigator && (
                <button
                  type="button"
                  onClick={connectWebSerial}
                  className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
                  title="Connect via Web Serial API (USB FTDI/RS-232 Cable)"
                >
                  <FiCpu className="w-3.5 h-3.5" />
                  <span>USB Serial</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex items-center gap-1.5 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              <FiZapOff className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          )}

          {/* Quick toggle for Simulator Controls & Inspector */}
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            aria-label="Toggle load cell physics and simulator controls"
            aria-pressed={showControls}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              showControls ? 'bg-primary-500/20 text-primary-300 border-primary-500/40' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Load Cell Physics & Simulator Controls"
          >
            <FiSliders className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setShowInspector((v) => !v)}
            aria-label="Toggle raw ASCII/hex protocol frame inspector"
            aria-pressed={showInspector}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              showInspector ? 'bg-primary-500/20 text-primary-300 border-primary-500/40' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Raw ASCII/Hex Protocol Frame Inspector"
          >
            <FiTerminal className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Terminal Display Pane */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Digital Fluorescent Indicator Display */}
        <div className="lg:col-span-7 bg-black border-2 border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-inner relative overflow-hidden">
          {/* Subtle LCD background glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none" />

          {/* Annunciator Flags Bar */}
          <div className="flex items-center justify-between text-[11px] font-mono mb-2 z-10">
            {/* Center of Zero */}
            <div className={`px-2 py-0.5 rounded font-bold border ${
              isCenterOfZero
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                : 'text-slate-700 border-transparent'
            }`}>
              &gt;0&lt; ZERO
            </div>

            {/* Stability Lock Indicator */}
            <div className={`px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
              isStable
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-400 border-amber-500/40 animate-pulse'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isStable ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isStable ? 'STABLE' : 'MOTION'}
            </div>

            {/* Net / Gross Annunciator */}
            <div className="flex items-center gap-1">
              <span className={`px-1.5 py-0.5 rounded font-bold ${
                isTareActive ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/30' : 'text-slate-700'
              }`}>
                NET
              </span>
              <span className={`px-1.5 py-0.5 rounded font-bold ${
                !isTareActive ? 'bg-slate-900 text-slate-300' : 'text-slate-700'
              }`}>
                GROSS
              </span>
            </div>

            {/* Overload Flag */}
            {isOverload && (
              <div className="px-2 py-0.5 bg-rose-950 text-rose-400 border border-rose-500/50 rounded font-bold animate-bounce">
                OVERLOAD
              </div>
            )}
          </div>

          {/* Main 7-Segment Weight Readout */}
          <div className="flex items-baseline justify-end gap-3 my-1 font-mono z-10">
            <span className={`text-4xl sm:text-5xl font-black tracking-wider transition-colors duration-75 ${
              isOverload
                ? 'text-rose-500 animate-pulse'
                : isStable
                ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]'
                : 'text-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.25)]'
            }`}>
              {isOverload ? '------' : (typeof liveWeight === 'number' ? liveWeight.toFixed(intervalD < 1 ? 2 : 1) : liveWeight)}
            </span>
            <span className="text-xl sm:text-2xl font-bold text-emerald-500/80">{unit}</span>
          </div>

          {/* Sub-line Metrological Information */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-900 z-10">
            <span>Capacity: {maxCap.toLocaleString()} {unit}</span>
            <span>e = {intervalE} {unit} | d = {intervalD} {unit}</span>
            {isTareActive && <span className="text-cyan-400">Tare: {tareWeight} {unit}</span>}
          </div>
        </div>

        {/* Action Controls & Reading Capture */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3 h-full">
          {/* Indicator Keypad Buttons (Zero, Tare, Clear) */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleZero}
              disabled={!isConnected}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg text-xs font-bold font-mono flex flex-col items-center gap-0.5 transition-colors active:scale-95"
            >
              <span>&gt;0&lt; ZERO</span>
              <span className="text-[9px] text-slate-400 font-normal">Command [Z]</span>
            </button>

            <button
              type="button"
              onClick={handleTare}
              disabled={!isConnected}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg text-xs font-bold font-mono flex flex-col items-center gap-0.5 transition-colors active:scale-95"
            >
              <span>[T] TARE</span>
              <span className="text-[9px] text-slate-400 font-normal">Net Mode</span>
            </button>

            <button
              type="button"
              onClick={handleClearTare}
              disabled={!isConnected || !isTareActive}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700 rounded-lg text-xs font-bold font-mono flex flex-col items-center gap-0.5 transition-colors active:scale-95"
            >
              <span>CLR TARE</span>
              <span className="text-[9px] text-slate-400 font-normal">Gross Mode</span>
            </button>
          </div>

          {/* Primary Single-Click Capture Button */}
          <button
            type="button"
            onClick={handleCapture}
            disabled={!isConnected}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${
              !isConnected
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : isStable
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/50'
                : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-950/50'
            }`}
          >
            <FiCornerDownLeft className="w-5 h-5" />
            <span>Capture Active Reading ({liveWeight} {unit})</span>
          </button>
        </div>
      </div>

      {/* Expandable Simulator Load Controls Pane */}
      {showControls && (
        <div className="bg-slate-950/90 border-t border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span className="flex items-center gap-1.5 text-slate-200 font-bold">
              <FiSliders className="w-3.5 h-3.5 text-primary-400" />
              <span>Weighbridge Load Cell & Physics Simulator</span>
            </span>
            <span className="font-mono text-[11px]">Simulated Target Load: {simTargetLoad} {unit}</span>
          </div>

          {/* Quick Preset Buttons (0%, 20%, 40%, 60%, 80%, 100% of Max) */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((pct) => {
              const loadVal = Math.round(maxCap * pct);
              const isActive = simTargetLoad === loadVal;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSetTargetLoad(loadVal)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white border-primary-500 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {(pct * 100).toFixed(0)}% ({loadVal >= 1000 ? `${(loadVal / 1000).toFixed(0)}t` : `${loadVal}${unit}`})
                </button>
              );
            })}
          </div>

          {/* Continuous Weight Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400 font-mono">
              <span>0 {unit}</span>
              <span>Target: {simTargetLoad} {unit}</span>
              <span>Max: {maxCap} {unit}</span>
            </div>
            <input
              type="range"
              min="0"
              max={maxCap}
              step={intervalD}
              value={simTargetLoad}
              onChange={(e) => handleSetTargetLoad(e.target.value)}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>
        </div>
      )}

      {/* Expandable Protocol Inspector Pane */}
      {showInspector && (
        <div className="bg-black/90 border-t border-slate-800 p-4 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 font-semibold border-b border-slate-800 pb-1.5">
            <span className="flex items-center gap-1.5 text-cyan-300">
              <FiTerminal className="w-3.5 h-3.5" />
              <span>Real-Time RS-232 Protocol Frame Inspector</span>
            </span>
            <span className="text-[11px] text-slate-500">Baud: 9600 8-N-1 | Stream Rate: ~6.6 Hz</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Raw ASCII */}
            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Raw ASCII Frame</span>
              <pre className="text-emerald-400 whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(rawAscii)}</pre>
            </div>

            {/* Raw Hex */}
            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Raw Hexadecimal Bytes</span>
              <pre className="text-cyan-400 whitespace-pre-wrap break-all text-[11px]">{rawHex || 'N/A'}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
