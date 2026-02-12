import { useMemo } from 'react';
import type { PitchData } from '../hooks/usePitchDetection';

interface PitchIndicatorProps {
  pitchData: PitchData;
}

export default function PitchIndicator({ pitchData }: PitchIndicatorProps) {
  const { cents, isActive, note, frequency, targetFrequency } = pitchData;

  const clampedCents = Math.max(-50, Math.min(50, cents));
  const isTuned = isActive && Math.abs(cents) <= 3;
  const isClose = isActive && Math.abs(cents) <= 10;

  // Arc configuration
  const centerX = 200;
  const centerY = 200;
  const radius = 160;
  const startAngle = -135;
  const endAngle = 135;
  const totalArc = endAngle - startAngle;

  // Needle angle based on cents deviation
  const needleAngle = isActive ? (clampedCents / 50) * (totalArc / 2) : 0;

  // Generate tick marks
  const ticks = useMemo(() => {
    const result = [];
    const tickCount = 50;
    for (let i = 0; i <= tickCount; i++) {
      const angle = startAngle + (i / tickCount) * totalArc;
      const rad = (angle * Math.PI) / 180;
      const isMajor = i % 25 === 0;
      const isMedium = i % 5 === 0;
      const innerR = isMajor ? radius - 20 : isMedium ? radius - 14 : radius - 8;
      const outerR = radius;

      result.push({
        x1: centerX + innerR * Math.cos(rad),
        y1: centerY + innerR * Math.sin(rad),
        x2: centerX + outerR * Math.cos(rad),
        y2: centerY + outerR * Math.sin(rad),
        isMajor,
        isMedium,
        angle,
      });
    }
    return result;
  }, []);

  // Color based on tuning state
  const indicatorColor = isTuned ? '#4ade80' : isClose ? '#fbbf24' : isActive ? '#f87171' : '#4a5568';
  // Needle endpoint
  const needleRad = ((needleAngle - 90) * Math.PI) / 180;
  const needleLen = radius - 30;
  const needleX = centerX + needleLen * Math.cos(needleRad);
  const needleY = centerY + needleLen * Math.sin(needleRad);

  // Indicator dot position on arc
  const dotAngle = needleAngle + (startAngle + endAngle) / 2;
  const dotRad = (dotAngle * Math.PI) / 180;
  const dotX = centerX + (radius + 12) * Math.cos(dotRad);
  const dotY = centerY + (radius + 12) * Math.sin(dotRad);

  // Labels
  const flatRad = ((startAngle + 20) * Math.PI) / 180;
  const sharpRad = ((endAngle - 20) * Math.PI) / 180;
  const labelR = radius + 30;

  return (
    <div className="pitch-indicator">
      <svg viewBox="0 0 400 260" className="pitch-svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strongGlow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={indicatorColor} />
            <stop offset="100%" stopColor={indicatorColor} stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Background arc track */}
        {ticks.map((tick, i) => {
          // Highlight ticks near the center green zone
          const normalizedPos = (tick.angle - startAngle) / totalArc;
          const distFromCenter = Math.abs(normalizedPos - 0.5) * 2;
          const isGreenZone = distFromCenter < 0.08;
          const isYellowZone = distFromCenter < 0.2;

          let color = '#2a2a3a';
          if (isActive) {
            if (isGreenZone) color = isTuned ? '#4ade80' : '#1a3a2a';
            else if (isYellowZone) color = '#2a2a1a';
          }

          return (
            <line
              key={i}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={color}
              strokeWidth={tick.isMajor ? 3 : tick.isMedium ? 2 : 1}
              strokeLinecap="round"
              opacity={tick.isMajor ? 1 : tick.isMedium ? 0.7 : 0.4}
            />
          );
        })}

        {/* Center green zone indicator */}
        {isActive && (
          <path
            d={(() => {
              const zoneSize = 4;
              const a1 = ((-zoneSize - 90) * Math.PI) / 180;
              const a2 = ((zoneSize - 90) * Math.PI) / 180;
              const r1 = radius - 4;
              const r2 = radius + 4;
              return `M ${centerX + r1 * Math.cos(a1)},${centerY + r1 * Math.sin(a1)}
                      A ${r1} ${r1} 0 0 1 ${centerX + r1 * Math.cos(a2)},${centerY + r1 * Math.sin(a2)}
                      L ${centerX + r2 * Math.cos(a2)},${centerY + r2 * Math.sin(a2)}
                      A ${r2} ${r2} 0 0 0 ${centerX + r2 * Math.cos(a1)},${centerY + r2 * Math.sin(a1)} Z`;
            })()}
            fill={isTuned ? '#4ade80' : '#2a5a3a'}
            opacity={isTuned ? 0.9 : 0.5}
            filter={isTuned ? 'url(#glow)' : undefined}
          />
        )}

        {/* Flat / Sharp labels */}
        <text
          x={centerX + labelR * Math.cos(flatRad)}
          y={centerY + labelR * Math.sin(flatRad)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#6b7280"
          fontSize="11"
          fontFamily="system-ui"
        >
          &#9837;
        </text>
        <text
          x={centerX + labelR * Math.cos(sharpRad)}
          y={centerY + labelR * Math.sin(sharpRad)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#6b7280"
          fontSize="11"
          fontFamily="system-ui"
        >
          &#9839;
        </text>

        {/* Needle */}
        {isActive && (
          <g filter="url(#glow)">
            <line
              x1={centerX}
              y1={centerY}
              x2={needleX}
              y2={needleY}
              stroke={indicatorColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              className="needle"
            />
            {/* Needle dot at tip */}
            <circle cx={needleX} cy={needleY} r="5" fill={indicatorColor} />
          </g>
        )}

        {/* Center hub */}
        <circle cx={centerX} cy={centerY} r="8" fill="#1a1a2e" stroke="#2a2a4a" strokeWidth="2" />
        <circle cx={centerX} cy={centerY} r="4" fill={isActive ? indicatorColor : '#3a3a5a'} />

        {/* Indicator dot on arc */}
        {isActive && (
          <circle
            cx={dotX}
            cy={dotY}
            r="6"
            fill={indicatorColor}
            filter="url(#strongGlow)"
            className="indicator-dot"
          />
        )}

        {/* Note display */}
        <text
          x={centerX}
          y={centerY + 55}
          textAnchor="middle"
          fill={isActive ? indicatorColor : '#4a5568'}
          fontSize="48"
          fontWeight="bold"
          fontFamily="system-ui"
          filter={isTuned ? 'url(#glow)' : undefined}
          className="note-display"
        >
          {note}
        </text>

        {/* Frequency display */}
        {isActive && frequency > 0 && (
          <text
            x={centerX}
            y={centerY + 80}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="13"
            fontFamily="system-ui"
          >
            {frequency.toFixed(1)} Hz
          </text>
        )}

        {/* Cents display */}
        {isActive && (
          <text
            x={centerX}
            y={centerY + 100}
            textAnchor="middle"
            fill={indicatorColor}
            fontSize="14"
            fontWeight="600"
            fontFamily="system-ui"
          >
            {cents > 0 ? '+' : ''}
            {cents.toFixed(0)} cents
          </text>
        )}

        {/* Target frequency */}
        {isActive && targetFrequency > 0 && (
          <text
            x={centerX}
            y={centerY + 118}
            textAnchor="middle"
            fill="#4a5568"
            fontSize="10"
            fontFamily="system-ui"
          >
            cible: {targetFrequency.toFixed(1)} Hz
          </text>
        )}

        {/* Tuned badge */}
        {isTuned && (
          <g filter="url(#strongGlow)">
            <circle cx={centerX} cy={centerY + 145} r="14" fill="#4ade80" opacity="0.2" />
            <text
              x={centerX}
              y={centerY + 150}
              textAnchor="middle"
              fill="#4ade80"
              fontSize="12"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              ACCORD
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
