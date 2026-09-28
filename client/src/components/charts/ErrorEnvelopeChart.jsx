import React, { useState, useMemo, useRef } from 'react';
import {
  FiDownload,
  FiCheckCircle,
  FiAlertTriangle,
  FiInfo,
  FiLayers,
  FiMaximize2,
  FiRefreshCw,
} from 'react-icons/fi';
import {
  calculateMultiIntervalMPE,
  getMPEFactor,
  calculateContinuousIndication,
  calculateCorrectedError,
} from '../../utils/metrology';

/**
 * Interactive Error Envelope Curve Component conforming to OIML R-76 (Edition 2006/E)
 * 
 * Plots:
 * - Applied Load L (X-Axis) vs. Indicated Error Ec (Y-Axis)
 * - Upper and Lower stepped OIML R-76 MPE tolerance boundaries (±0.5e, ±1.0e, ±1.5e)
 * - Loading (increasing) and Unloading (decreasing) error curves
 * - Hysteresis band visualization
 * - Pass/Fail color-coded data points
 * - Interactive hover tooltips & high-resolution PNG/SVG vector exports
 */
export default function ErrorEnvelopeChart({
  points = [],
  instrument = {},
  isInService: initialIsInService = false,
  interactive = true,
  showHysteresis: initialShowHysteresis = true,
  showExport = true,
  title = 'OIML R-76 Indicated Error vs. Tolerance Envelope',
  className = '',
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const [isInService, setIsInService] = useState(initialIsInService);
  const [showHysteresis, setShowHysteresis] = useState(initialShowHysteresis);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Instrument parameters
  const accClass = instrument?.accuracyClass || 'CLASS_III';
  const e = Number(instrument?.verificationInterval || 1);
  const unit = instrument?.unit || 'kg';
  const maxCapacity = Number(instrument?.maxCapacity || 1000);
  const minCapacity = Number(instrument?.minCapacity || 0);
  const ranges = instrument?.ranges || instrument?.multiIntervalRanges || null;

  // Process and compute standardized points
  const processedPoints = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) {
      return [];
    }

    return points.map((pt, idx) => {
      const load = Number(pt.appliedLoad ?? pt.load ?? 0);
      let error = 0;
      let continuousIndication = pt.indicatedValue ?? load;

      if (pt.correctedError !== undefined && pt.correctedError !== null) {
        error = Number(pt.correctedError);
      } else if (pt.error !== undefined && pt.error !== null) {
        error = Number(pt.error);
      } else if (pt.indicatedValue !== undefined) {
        const delta = pt.deltaL !== undefined ? Number(pt.deltaL) : 0;
        continuousIndication = calculateContinuousIndication(pt.indicatedValue, e, delta);
        const errObj = calculateCorrectedError(continuousIndication, load, 0);
        error = errObj.Ec;
      }

      // Calculate MPE for this load
      let mpeResult;
      if (ranges && ranges.length > 0) {
        mpeResult = calculateMultiIntervalMPE(load, accClass, ranges, isInService);
      } else {
        const mpeInE = getMPEFactor(accClass, load / e, isInService);
        mpeResult = {
          mpe: Number((mpeInE * e).toFixed(6)),
          mpeInE,
          currentE: e,
        };
      }

      const mpeUpper = Number(mpeResult.mpe.toFixed(6));
      const mpeLower = Number((-mpeResult.mpe).toFixed(6));
      const isPass = Math.abs(error) <= mpeUpper + 1e-9;

      return {
        id: idx,
        load,
        indicatedValue: pt.indicatedValue !== undefined ? Number(pt.indicatedValue) : load,
        continuousIndication: Number(Number(continuousIndication).toFixed(4)),
        deltaL: pt.deltaL !== undefined ? Number(pt.deltaL) : undefined,
        error: Number(error.toFixed(4)),
        mpeUpper,
        mpeLower,
        mpeInE: mpeResult.mpeInE,
        isPass,
        isIncreasing: pt.isIncreasing !== false,
      };
    });
  }, [points, accClass, e, ranges, isInService]);

  // Separate loading vs unloading series
  const loadingPoints = useMemo(
    () => processedPoints.filter((p) => p.isIncreasing).sort((a, b) => a.load - b.load),
    [processedPoints]
  );
  const unloadingPoints = useMemo(
    () => processedPoints.filter((p) => !p.isIncreasing).sort((a, b) => b.load - a.load),
    [processedPoints]
  );

  // Determine Max Load for X-axis
  const maxLoadDomain = useMemo(() => {
    const ptMax = processedPoints.reduce((max, p) => Math.max(max, p.load), 0);
    return Math.max(maxCapacity, ptMax, 10);
  }, [processedPoints, maxCapacity]);

  // Determine Max Error for Y-axis symmetric domain
  const { maxMpeAcrossSpan, yDomainMax } = useMemo(() => {
    let maxMpe = 0;
    const testLoads = [0, maxLoadDomain * 0.25, maxLoadDomain * 0.5, maxLoadDomain * 0.75, maxLoadDomain];
    testLoads.forEach((l) => {
      const res = ranges && ranges.length > 0
        ? calculateMultiIntervalMPE(l, accClass, ranges, isInService)
        : { mpe: getMPEFactor(accClass, l / e, isInService) * e };
      if (res.mpe > maxMpe) maxMpe = res.mpe;
    });

    const maxObsError = processedPoints.reduce((max, p) => Math.max(max, Math.abs(p.error)), 0);
    const domainCandidate = Math.max(maxMpe * 1.35, maxObsError * 1.25, e * 1.5);
    return {
      maxMpeAcrossSpan: Number(maxMpe.toFixed(4)),
      yDomainMax: Number(domainCandidate.toFixed(4)),
    };
  }, [maxLoadDomain, accClass, e, ranges, isInService, processedPoints]);

  // SVG Dimensions & Margins
  const viewBoxWidth = 840;
  const viewBoxHeight = 440;
  const margin = { top: 35, right: 35, bottom: 55, left: 75 };
  const plotWidth = viewBoxWidth - margin.left - margin.right;
  const plotHeight = viewBoxHeight - margin.top - margin.bottom;

  // Scale mapping functions
  const getX = (load) => margin.left + (load / maxLoadDomain) * plotWidth;
  const getY = (error) => margin.top + plotHeight / 2 - (error / yDomainMax) * (plotHeight / 2);

  // Generate stepped MPE envelope path
  const { envelopePathD, upperStepPathD, lowerStepPathD, stepTransitions } = useMemo(() => {
    // Generate fine-grained step boundary points from 0 to maxLoadDomain
    const transitionLoads = new Set([0, maxLoadDomain]);

    // OIML R-76 class transition multipliers in e
    const classSteps = {
      CLASS_I: [50000, 200000],
      CLASS_II: [5000, 20000, 100000],
      CLASS_III: [500, 2000, 10000],
      CLASS_IIII: [50, 200, 1000],
    };

    const normClass = String(accClass).toUpperCase();
    const multipliers = classSteps[normClass] || classSteps.CLASS_III;

    if (ranges && ranges.length > 0) {
      ranges.forEach((r) => {
        if (r.max && r.max < maxLoadDomain) transitionLoads.add(r.max);
        multipliers.forEach((m) => {
          const stepLoad = m * (r.e || e);
          if (stepLoad < (r.max || maxLoadDomain)) transitionLoads.add(stepLoad);
        });
      });
    } else {
      multipliers.forEach((m) => {
        const stepLoad = m * e;
        if (stepLoad < maxLoadDomain) transitionLoads.add(stepLoad);
      });
    }

    // Include all test point loads as sample points
    processedPoints.forEach((p) => transitionLoads.add(p.load));

    const sortedLoads = Array.from(transitionLoads).sort((a, b) => a - b);

    // Build stepped upper and lower points
    const upperPoints = [];
    const lowerPoints = [];
    const transitions = [];

    for (let i = 0; i < sortedLoads.length; i++) {
      const load = sortedLoads[i];
      const mpeRes = ranges && ranges.length > 0
        ? calculateMultiIntervalMPE(load, accClass, ranges, isInService)
        : { mpe: getMPEFactor(accClass, load / e, isInService) * e, mpeInE: getMPEFactor(accClass, load / e, isInService) };

      const mpe = mpeRes.mpe;
      upperPoints.push({ x: getX(load), y: getY(mpe), load, mpe });
      lowerPoints.push({ x: getX(load), y: getY(-mpe), load, mpe: -mpe });

      if (i > 0) {
        const prevMpe = upperPoints[upperPoints.length - 2].mpe;
        if (Math.abs(prevMpe - mpe) > 1e-6) {
          transitions.push({
            load,
            x: getX(load),
            prevMpe,
            newMpe: mpe,
            mpeInE: mpeRes.mpeInE,
          });
        }
      }
    }

    // Build SVG Path strings
    let uPath = `M ${upperPoints[0].x} ${upperPoints[0].y}`;
    for (let i = 1; i < upperPoints.length; i++) {
      // Step line: horizontal to next X, then vertical
      uPath += ` L ${upperPoints[i].x} ${upperPoints[i].y}`;
    }

    let lPath = `M ${lowerPoints[0].x} ${lowerPoints[0].y}`;
    for (let i = 1; i < lowerPoints.length; i++) {
      lPath += ` L ${lowerPoints[i].x} ${lowerPoints[i].y}`;
    }

    // Closed envelope polygon: upper path forward, lower path backward
    let envPath = `M ${upperPoints[0].x} ${upperPoints[0].y}`;
    for (let i = 1; i < upperPoints.length; i++) {
      envPath += ` L ${upperPoints[i].x} ${upperPoints[i].y}`;
    }
    for (let i = lowerPoints.length - 1; i >= 0; i--) {
      envPath += ` L ${lowerPoints[i].x} ${lowerPoints[i].y}`;
    }
    envPath += ' Z';

    return {
      envelopePathD: envPath,
      upperStepPathD: uPath,
      lowerStepPathD: lPath,
      stepTransitions: transitions,
    };
  }, [maxLoadDomain, accClass, e, ranges, isInService, processedPoints, yDomainMax]);

  // Build Loading Curve Path
  const loadingCurvePathD = useMemo(() => {
    if (loadingPoints.length < 2) return '';
    return loadingPoints.reduce((acc, pt, i) => {
      const x = getX(pt.load);
      const y = getY(pt.error);
      return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [loadingPoints, maxLoadDomain, yDomainMax]);

  // Build Unloading Curve Path
  const unloadingCurvePathD = useMemo(() => {
    if (unloadingPoints.length < 2) return '';
    return unloadingPoints.reduce((acc, pt, i) => {
      const x = getX(pt.load);
      const y = getY(pt.error);
      return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [unloadingPoints, maxLoadDomain, yDomainMax]);

  // Build Hysteresis Band Polygon
  const hysteresisPolygonD = useMemo(() => {
    if (!showHysteresis || loadingPoints.length < 2 || unloadingPoints.length < 2) return '';
    // Combine loading forward and unloading sorted descending
    const sortedDec = [...unloadingPoints].sort((a, b) => b.load - a.load);
    let poly = `M ${getX(loadingPoints[0].load)} ${getY(loadingPoints[0].error)}`;
    loadingPoints.forEach((p) => {
      poly += ` L ${getX(p.load)} ${getY(p.error)}`;
    });
    sortedDec.forEach((p) => {
      poly += ` L ${getX(p.load)} ${getY(p.error)}`;
    });
    poly += ' Z';
    return poly;
  }, [showHysteresis, loadingPoints, unloadingPoints, maxLoadDomain, yDomainMax]);

  // Statistics Summary
  const stats = useMemo(() => {
    if (processedPoints.length === 0) {
      // No data points: conformity is UNKNOWN, not PASS. Returning `true` here
      // would fabricate a passing verdict for an empty chart, which is a
      // legal-metrology integrity violation. `null` renders a neutral badge.
      return { maxPosErr: 0, maxNegErr: 0, maxAbsErr: 0, maxHysteresis: 0, overallPass: null };
    }

    let maxPos = 0;
    let maxNeg = 0;
    let overallPass = true;

    processedPoints.forEach((p) => {
      if (p.error > maxPos) maxPos = p.error;
      if (p.error < maxNeg) maxNeg = p.error;
      if (!p.isPass) overallPass = false;
    });

    // Compute Hysteresis across matching nominal loads
    let maxHys = 0;
    loadingPoints.forEach((inc) => {
      const matchingDec = unloadingPoints.find((dec) => Math.abs(dec.load - inc.load) < 1e-4);
      if (matchingDec) {
        const hys = Math.abs(matchingDec.error - inc.error);
        if (hys > maxHys) maxHys = hys;
      }
    });

    return {
      maxPosErr: maxPos,
      maxNegErr: maxNeg,
      maxAbsErr: Number(Math.max(Math.abs(maxPos), Math.abs(maxNeg)).toFixed(4)),
      maxHysteresis: Number(maxHys.toFixed(4)),
      overallPass,
    };
  }, [processedPoints, loadingPoints, unloadingPoints]);

  // Export handlers
  const handleExportSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `OIML_R76_Error_Envelope_${instrument?.serialNumber || 'Instrument'}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleExportPNG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const scale = 2; // 2x resolution
    canvas.width = viewBoxWidth * scale;
    canvas.height = viewBoxHeight * scale;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `OIML_R76_Error_Envelope_${instrument?.serialNumber || 'Instrument'}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };
    img.src = url;
  };

  // Generate clean Y-Axis Grid Ticks
  const yTicks = useMemo(() => {
    const ticks = [];
    const numSteps = 4;
    for (let i = -numSteps; i <= numSteps; i++) {
      const val = Number(((i / numSteps) * yDomainMax).toFixed(4));
      ticks.push({
        val,
        y: getY(val),
        isZero: i === 0,
      });
    }
    return ticks;
  }, [yDomainMax, plotHeight]);

  // Generate clean X-Axis Grid Ticks
  const xTicks = useMemo(() => {
    const ticks = [];
    const stepCount = 5;
    for (let i = 0; i <= stepCount; i++) {
      const load = Number(((i / stepCount) * maxLoadDomain).toFixed(2));
      ticks.push({
        load,
        x: getX(load),
      });
    }
    return ticks;
  }, [maxLoadDomain, plotWidth]);

  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-4 ${className}`}>
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                stats.overallPass === null
                  ? 'bg-slate-100 text-slate-500 border-slate-300'
                  : stats.overallPass
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {stats.overallPass === null
                ? 'Envelope Conformity: NO DATA'
                : stats.overallPass
                ? 'Envelope Conformity: PASS'
                : 'Envelope Conformity: FAIL'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            OIML R-76-1 Table 3 Stepped MPE Limits (±0.5e, ±1.0e, ±1.5e) • {accClass.replace('_', ' ')} • Max:{' '}
            {maxCapacity} {unit} (e = {e} {unit})
          </p>
        </div>

        {/* Action Buttons & Toggles */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setIsInService(!isInService)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
              isInService
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
            title="In-Service MPE is 2x Initial Verification MPE per OIML R-76-1 clause 3.5.2"
          >
            <span>In-Service (2× MPE):</span>
            <span className="font-bold">{isInService ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHysteresis(!showHysteresis)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
              showHysteresis
                ? 'bg-purple-100 text-purple-900 border-purple-300'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
            title="Toggle Hysteresis Loop Shading"
          >
            Hysteresis
          </button>

          <button
            type="button"
            onClick={() => setShowDataLabels(!showDataLabels)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
              showDataLabels
                ? 'bg-blue-100 text-blue-900 border-blue-300'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            Labels
          </button>

          {showExport && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportSVG}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
                title="Export Vector SVG"
              >
                <FiDownload className="w-3 h-3" />
                <span>SVG</span>
              </button>
              <button
                type="button"
                onClick={handleExportPNG}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-primary-600 rounded hover:bg-primary-700 transition-colors shadow-xs"
                title="Export High-Resolution PNG"
              >
                <FiDownload className="w-3 h-3" />
                <span>PNG</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart Canvas */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden bg-slate-50/50 rounded border border-slate-100 p-2"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-auto max-h-[420px] select-none"
          role="img"
          aria-label={
            processedPoints.length === 0
              ? `${title}. No calibration data points available to plot.`
              : `${title}. ${processedPoints.length} data point${
                  processedPoints.length === 1 ? '' : 's'
                } plotted against OIML R-76 stepped MPE tolerance envelope. ` +
                `Maximum absolute error ${stats.maxAbsErr} ${unit}. ` +
                `Overall envelope conformity: ${stats.overallPass ? 'PASS' : 'FAIL'}.`
          }
        >
          <title>{title}</title>
          <defs>
            {/* Shaded Tolerance Band Gradient */}
            <linearGradient id="mpeEnvelopeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.18" />
            </linearGradient>

            {/* Hysteresis Band Gradient */}
            <linearGradient id="hysteresisGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.22" />
            </linearGradient>

            {/* Marker definitions */}
            <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Plot Background */}
          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {/* Horizontal Y-Grid Lines */}
          {yTicks.map((tick, i) => (
            <g key={`y-grid-${i}`}>
              <line
                x1={margin.left}
                y1={tick.y}
                x2={margin.left + plotWidth}
                y2={tick.y}
                stroke={tick.isZero ? '#475569' : '#f1f5f9'}
                strokeWidth={tick.isZero ? 1.5 : 1}
                strokeDasharray={tick.isZero ? '4 2' : 'none'}
              />
              <text
                x={margin.left - 10}
                y={tick.y + 3.5}
                textAnchor="end"
                className="text-[10px] fill-slate-500 font-mono"
              >
                {tick.val > 0 ? `+${tick.val}` : tick.val}
              </text>
            </g>
          ))}

          {/* Vertical X-Grid Lines */}
          {xTicks.map((tick, i) => (
            <g key={`x-grid-${i}`}>
              <line
                x1={tick.x}
                y1={margin.top}
                x2={tick.x}
                y2={margin.top + plotHeight}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={margin.top + plotHeight + 18}
                textAnchor="middle"
                className="text-[10px] fill-slate-600 font-mono"
              >
                {tick.load}
              </text>
            </g>
          ))}

          {/* Shaded Stepped MPE Envelope */}
          <path d={envelopePathD} fill="url(#mpeEnvelopeGrad)" />

          {/* Upper & Lower Stepped MPE Boundary Lines */}
          <path
            d={upperStepPathD}
            fill="none"
            stroke="#059669"
            strokeWidth="2"
            strokeDasharray="5 3"
          />
          <path
            d={lowerStepPathD}
            fill="none"
            stroke="#059669"
            strokeWidth="2"
            strokeDasharray="5 3"
          />

          {/* Boundary Step Step Annotations */}
          {stepTransitions.map((t, idx) => (
            <g key={`trans-${idx}`}>
              <line
                x1={t.x}
                y1={margin.top}
                x2={t.x}
                y2={margin.top + plotHeight}
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
              />
              <text
                x={t.x + 3}
                y={margin.top + 14}
                className="text-[9px] fill-emerald-800 font-semibold"
              >
                Step: {t.load} {unit}
              </text>
            </g>
          ))}

          {/* Hysteresis Loop Fill */}
          {showHysteresis && hysteresisPolygonD && (
            <path d={hysteresisPolygonD} fill="url(#hysteresisGrad)" />
          )}

          {/* Zero Error Reference Line Annotation */}
          <text
            x={margin.left + plotWidth - 8}
            y={getY(0) - 4}
            textAnchor="end"
            className="text-[9px] fill-slate-400 font-semibold uppercase tracking-wider"
          >
            Zero Error Line (Ec = 0)
          </text>

          {/* Loading Curve (Increasing) */}
          {loadingCurvePathD && (
            <path
              d={loadingCurvePathD}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Unloading Curve (Decreasing) */}
          {unloadingCurvePathD && (
            <path
              d={unloadingCurvePathD}
              fill="none"
              stroke="#d97706"
              strokeWidth="2.5"
              strokeDasharray="4 2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points */}
          {processedPoints.map((pt) => {
            const cx = getX(pt.load);
            const cy = getY(pt.error);
            const isHovered = hoveredPoint?.id === pt.id;

            return (
              <g
                key={`pt-${pt.id}`}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  if (interactive && containerRef.current) {
                    setHoveredPoint(pt);
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const targetRect = e.currentTarget.getBoundingClientRect();
                    const pointX = targetRect.left + targetRect.width / 2 - containerRect.left;
                    const pointY = targetRect.top + targetRect.height / 2 - containerRect.top;

                    const tipWidth = 220;
                    const tipHeight = 150;

                    // Clamped within container boundaries
                    let left = pointX - tipWidth / 2;
                    if (left < 10) {
                      left = 10;
                    } else if (left + tipWidth > containerRect.width - 10) {
                      left = Math.max(10, containerRect.width - tipWidth - 10);
                    }

                    // Vertically position: prefer above, flip below if close to top edge
                    let top = pointY - tipHeight - 12;
                    if (top < 10) {
                      top = pointY + 16;
                    }

                    setTooltipPos({ x: left, y: top });
                  }
                }}
                onMouseLeave={() => {
                  if (interactive) setHoveredPoint(null);
                }}
              >
                {/* Outer halo when hovered or failed */}
                {isHovered && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={10}
                    fill={pt.isPass ? '#10b98133' : '#ef444433'}
                    stroke={pt.isPass ? '#10b981' : '#ef4444'}
                    strokeWidth="1.5"
                  />
                )}

                {/* Point Marker */}
                {pt.isIncreasing ? (
                  // Circle for Loading
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : 4.5}
                    fill={pt.isPass ? '#10b981' : '#ef4444'}
                    stroke="#ffffff"
                    strokeWidth="2"
                    filter="url(#shadowFilter)"
                  />
                ) : (
                  // Diamond/Square for Unloading
                  <rect
                    x={cx - (isHovered ? 5.5 : 4)}
                    y={cy - (isHovered ? 5.5 : 4)}
                    width={isHovered ? 11 : 8}
                    height={isHovered ? 11 : 8}
                    fill={pt.isPass ? '#d97706' : '#ef4444'}
                    stroke="#ffffff"
                    strokeWidth="2"
                    transform={`rotate(45 ${cx} ${cy})`}
                    filter="url(#shadowFilter)"
                  />
                )}

                {/* Data Value Label on point */}
                {showDataLabels && (
                  <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    className="text-[9px] font-mono font-bold fill-slate-800"
                  >
                    {pt.error > 0 ? `+${pt.error}` : pt.error}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis Labels */}
          {/* X-Axis Title */}
          <text
            x={margin.left + plotWidth / 2}
            y={viewBoxHeight - 12}
            textAnchor="middle"
            className="text-xs font-bold fill-slate-700"
          >
            Applied Test Load L ({unit})
          </text>

          {/* Y-Axis Title */}
          <text
            x={-(margin.top + plotHeight / 2)}
            y={22}
            transform="rotate(-90)"
            textAnchor="middle"
            className="text-xs font-bold fill-slate-700"
          >
            Indicated Error Ec ({unit})
          </text>
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute z-20 bg-slate-900/95 backdrop-blur text-white text-xs rounded-lg p-3 shadow-xl border border-slate-700 pointer-events-none transition-opacity duration-150 min-w-[210px]"
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5 mb-1.5">
              <span className="font-bold flex items-center gap-1 text-slate-200">
                {hoveredPoint.isIncreasing ? '▲ Loading Series' : '▼ Unloading Series'}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  hoveredPoint.isPass ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                }`}
              >
                {hoveredPoint.isPass ? 'PASS' : 'FAIL'}
              </span>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Load (L):</span>
                <span className="font-bold text-white">
                  {hoveredPoint.load} {unit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Indication (I):</span>
                <span>
                  {hoveredPoint.indicatedValue} {unit}
                </span>
              </div>
              {hoveredPoint.deltaL !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Delta (ΔL):</span>
                  <span>
                    {hoveredPoint.deltaL} {unit}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Continuous (P):</span>
                <span>
                  {hoveredPoint.continuousIndication} {unit}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1 text-primary-300">
                <span className="font-bold">Error (Ec):</span>
                <span className="font-bold">
                  {hoveredPoint.error > 0 ? `+${hoveredPoint.error}` : hoveredPoint.error} {unit}
                </span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>MPE Limit:</span>
                <span>
                  ±{hoveredPoint.mpeUpper} {unit}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Stats Summary Footer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
        {/* Visual Legend */}
        <div className="flex items-center flex-wrap gap-4 text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1.5 bg-[#059669] rounded-sm inline-block" />
            <span className="text-[11px]">Stepped MPE Envelope (±0.5e, ±1.0e, ±1.5e)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb] inline-block border border-white" />
            <span className="text-[11px]">Loading (Increasing)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#d97706] inline-block transform rotate-45 border border-white" />
            <span className="text-[11px]">Unloading (Decreasing)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-purple-200 rounded-xs inline-block border border-purple-400" />
            <span className="text-[11px]">Hysteresis Band</span>
          </div>
        </div>

        {/* Numerical Summary Metrics */}
        <div className="flex items-center justify-start md:justify-end gap-4 text-[11px] font-mono text-slate-700 bg-slate-50 p-2 rounded border border-slate-200">
          <div>
            <span className="text-slate-400 block text-[10px]">Max |Ec|:</span>
            <span className="font-bold text-slate-900">
              {stats.maxAbsErr} {unit}
            </span>
          </div>
          <div className="border-l border-slate-200 pl-3">
            <span className="text-slate-400 block text-[10px]">Span MPE:</span>
            <span className="font-bold text-slate-900">
              ±{maxMpeAcrossSpan} {unit}
            </span>
          </div>
          {stats.maxHysteresis > 0 && (
            <div className="border-l border-slate-200 pl-3">
              <span className="text-slate-400 block text-[10px]">Max Hysteresis:</span>
              <span className="font-bold text-purple-700">
                {stats.maxHysteresis} {unit}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
