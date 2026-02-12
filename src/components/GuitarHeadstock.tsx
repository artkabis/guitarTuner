import { useCallback } from 'react';
import { STANDARD_TUNING, type PitchData } from '../hooks/usePitchDetection';

interface GuitarHeadstockProps {
  pitchData: PitchData;
  selectedString: number | null;
  onStringClick: (index: number) => void;
  isListening: boolean;
}

export default function GuitarHeadstock({
  pitchData,
  selectedString,
  onStringClick,
  isListening,
}: GuitarHeadstockProps) {
  const getStringState = useCallback(
    (index: number) => {
      const string = STANDARD_TUNING[index];
      const isDetected =
        isListening &&
        pitchData.isActive &&
        pitchData.note === string.note &&
        pitchData.octave === string.octave;
      const isSelected = selectedString === index;
      const isTuned = isDetected && Math.abs(pitchData.cents) <= 5;
      const isClose = isDetected && Math.abs(pitchData.cents) <= 15;

      return { isDetected, isSelected, isTuned, isClose };
    },
    [pitchData, selectedString, isListening],
  );

  // Tuning peg positions - left side (strings 6,5,4) and right side (strings 3,2,1)
  const leftPegs = [5, 4, 3]; // E2, A2, D3
  const rightPegs = [2, 1, 0]; // G3, B3, E4

  return (
    <div className="headstock-container">
      <svg viewBox="0 0 320 520" className="headstock-svg">
        <defs>
          <linearGradient id="headGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3a2a1a" />
            <stop offset="30%" stopColor="#2a1c0e" />
            <stop offset="70%" stopColor="#1e1208" />
            <stop offset="100%" stopColor="#2a1c0e" />
          </linearGradient>
          <linearGradient id="neckGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4a3520" />
            <stop offset="50%" stopColor="#3a2815" />
            <stop offset="100%" stopColor="#4a3520" />
          </linearGradient>
          <linearGradient id="stringGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4c5a0" />
            <stop offset="100%" stopColor="#a89060" />
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.5" />
          </filter>
          <filter id="innerShadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feOffset dx="0" dy="1" result="offsetBlur" />
            <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
          </filter>
          <radialGradient id="pegGrad" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#f5f0e0" />
            <stop offset="40%" stopColor="#e8dfc5" />
            <stop offset="100%" stopColor="#c4b896" />
          </radialGradient>
          <radialGradient id="pegGradActive" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#80ffaa" />
            <stop offset="40%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
          </radialGradient>
          <radialGradient id="pegGradClose" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="40%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>
          <radialGradient id="pegGradDetected" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="40%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </radialGradient>
        </defs>

        {/* Headstock body */}
        <path
          d="M 100,500
             L 100,440
             C 100,400 90,350 75,300
             C 55,230 50,180 55,130
             C 58,90 70,60 100,40
             C 120,28 140,22 160,20
             C 180,22 200,28 220,40
             C 250,60 262,90 265,130
             C 270,180 265,230 245,300
             C 230,350 220,400 220,440
             L 220,500 Z"
          fill="url(#headGrad)"
          filter="url(#shadow)"
          stroke="#1a0e05"
          strokeWidth="1.5"
        />

        {/* Wood grain texture lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={`grain-${i}`}
            d={`M ${115 + i * 20},480 C ${110 + i * 20},350 ${105 + i * 18},200 ${
              115 + i * 15
            },50`}
            fill="none"
            stroke="#4a3520"
            strokeWidth="0.5"
            opacity="0.3"
          />
        ))}

        {/* Neck extension */}
        <rect
          x="108"
          y="440"
          width="104"
          height="80"
          rx="2"
          fill="url(#neckGrad)"
          stroke="#1a0e05"
          strokeWidth="1"
        />

        {/* Nut */}
        <rect x="106" y="435" width="108" height="10" rx="2" fill="#f5f0e0" opacity="0.9" />

        {/* String slots on nut */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={`slot-${i}`}
            x={120 + i * 16}
            y="436"
            width="2"
            height="8"
            rx="1"
            fill="#8a7a60"
            opacity="0.6"
          />
        ))}

        {/* Strings running down the neck */}
        {STANDARD_TUNING.map((_, i) => {
          const x = 121 + i * 16;
          const state = getStringState(i);
          const thickness = 1.2 + (5 - i) * 0.3;
          return (
            <line
              key={`string-${i}`}
              x1={x}
              y1="445"
              x2={x}
              y2="520"
              stroke={state.isTuned ? '#4ade80' : state.isDetected ? '#fbbf24' : '#c4b896'}
              strokeWidth={thickness}
              opacity={0.8}
            />
          );
        })}

        {/* Brand/Logo area */}
        <text
          x="160"
          y="175"
          textAnchor="middle"
          fill="#8a7a60"
          fontSize="14"
          fontFamily="Georgia, serif"
          fontWeight="bold"
          opacity="0.6"
          letterSpacing="3"
        >
          FOLK
        </text>
        <text
          x="160"
          y="195"
          textAnchor="middle"
          fill="#6a5a40"
          fontSize="9"
          fontFamily="Georgia, serif"
          opacity="0.4"
          letterSpacing="5"
        >
          TUNER
        </text>

        {/* Left side pegs (E2, A2, D3) */}
        {leftPegs.map((stringIdx, i) => {
          const y = 240 + i * 75;
          const state = getStringState(stringIdx);
          const string = STANDARD_TUNING[stringIdx];

          let pegFill = 'url(#pegGrad)';
          if (state.isTuned) pegFill = 'url(#pegGradActive)';
          else if (state.isClose) pegFill = 'url(#pegGradClose)';
          else if (state.isDetected) pegFill = 'url(#pegGradDetected)';

          // String line from peg to nut
          const nutX = 121 + stringIdx * 16;
          const thickness = 1.2 + (5 - stringIdx) * 0.3;

          return (
            <g key={`left-${stringIdx}`} className="peg-group" onClick={() => onStringClick(stringIdx)}>
              {/* String from peg to nut */}
              <line
                x1={72}
                y1={y}
                x2={nutX}
                y2={440}
                stroke={state.isTuned ? '#4ade80' : state.isDetected ? '#fbbf24' : '#c4b896'}
                strokeWidth={thickness}
                opacity={0.7}
              />
              {/* Peg shaft */}
              <rect
                x="30"
                y={y - 6}
                width="45"
                height="12"
                rx="3"
                fill="#8a7a60"
                opacity="0.8"
              />
              {/* Peg button */}
              <ellipse
                cx="28"
                cy={y}
                rx="22"
                ry="16"
                fill={pegFill}
                stroke={state.isTuned ? '#22c55e' : state.isClose ? '#d97706' : '#a89060'}
                strokeWidth="2"
                className="peg-button"
              />
              {/* Peg knurl lines */}
              {[-8, -4, 0, 4, 8].map((offset) => (
                <line
                  key={offset}
                  x1={28 + offset}
                  y1={y - 12}
                  x2={28 + offset}
                  y2={y + 12}
                  stroke={state.isTuned ? '#166534' : '#7a6a50'}
                  strokeWidth="0.5"
                  opacity="0.4"
                />
              ))}
              {/* String label */}
              <text
                x="28"
                y={y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={state.isTuned ? '#052e16' : '#3a2a15'}
                fontSize="13"
                fontWeight="bold"
                fontFamily="system-ui"
              >
                {string.label}
              </text>
              {/* Octave number */}
              <text
                x="28"
                y={y + 13}
                textAnchor="middle"
                fill={state.isTuned ? '#166534' : '#6a5a40'}
                fontSize="7"
                fontFamily="system-ui"
              >
                {string.octave}
              </text>

              {/* Glow effect when tuned */}
              {state.isTuned && (
                <ellipse
                  cx="28"
                  cy={y}
                  rx="26"
                  ry="20"
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2"
                  opacity="0.5"
                  className="tuned-glow"
                />
              )}
            </g>
          );
        })}

        {/* Right side pegs (G3, B3, E4) */}
        {rightPegs.map((stringIdx, i) => {
          const y = 240 + i * 75;
          const state = getStringState(stringIdx);
          const string = STANDARD_TUNING[stringIdx];

          let pegFill = 'url(#pegGrad)';
          if (state.isTuned) pegFill = 'url(#pegGradActive)';
          else if (state.isClose) pegFill = 'url(#pegGradClose)';
          else if (state.isDetected) pegFill = 'url(#pegGradDetected)';

          const nutX = 121 + stringIdx * 16;
          const thickness = 1.2 + (5 - stringIdx) * 0.3;

          return (
            <g key={`right-${stringIdx}`} className="peg-group" onClick={() => onStringClick(stringIdx)}>
              {/* String from peg to nut */}
              <line
                x1={248}
                y1={y}
                x2={nutX}
                y2={440}
                stroke={state.isTuned ? '#4ade80' : state.isDetected ? '#fbbf24' : '#c4b896'}
                strokeWidth={thickness}
                opacity={0.7}
              />
              {/* Peg shaft */}
              <rect
                x="245"
                y={y - 6}
                width="45"
                height="12"
                rx="3"
                fill="#8a7a60"
                opacity="0.8"
              />
              {/* Peg button */}
              <ellipse
                cx="292"
                cy={y}
                rx="22"
                ry="16"
                fill={pegFill}
                stroke={state.isTuned ? '#22c55e' : state.isClose ? '#d97706' : '#a89060'}
                strokeWidth="2"
                className="peg-button"
              />
              {/* Peg knurl lines */}
              {[-8, -4, 0, 4, 8].map((offset) => (
                <line
                  key={offset}
                  x1={292 + offset}
                  y1={y - 12}
                  x2={292 + offset}
                  y2={y + 12}
                  stroke={state.isTuned ? '#166534' : '#7a6a50'}
                  strokeWidth="0.5"
                  opacity="0.4"
                />
              ))}
              {/* String label */}
              <text
                x="292"
                y={y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={state.isTuned ? '#052e16' : '#3a2a15'}
                fontSize="13"
                fontWeight="bold"
                fontFamily="system-ui"
              >
                {string.label}
              </text>
              {/* Octave number */}
              <text
                x="292"
                y={y + 13}
                textAnchor="middle"
                fill={state.isTuned ? '#166534' : '#6a5a40'}
                fontSize="7"
                fontFamily="system-ui"
              >
                {string.octave}
              </text>

              {state.isTuned && (
                <ellipse
                  cx="292"
                  cy={y}
                  rx="26"
                  ry="20"
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2"
                  opacity="0.5"
                  className="tuned-glow"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
