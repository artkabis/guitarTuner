import { usePitchDetection, STANDARD_TUNING } from '../hooks/usePitchDetection';
import GuitarHeadstock from './GuitarHeadstock';
import PitchIndicator from './PitchIndicator';

export default function GuitarTuner() {
  const {
    pitchData,
    isListening,
    selectedString,
    startListening,
    stopListening,
    playReferenceNote,
  } = usePitchDetection();

  const isTuned = pitchData.isActive && Math.abs(pitchData.cents) <= 3;

  return (
    <div className="tuner-app">
      {/* Header */}
      <header className="tuner-header">
        <h1 className="tuner-title">Guitar Tuner</h1>
        <span className="tuner-badge">Folk</span>
      </header>

      {/* Pitch Indicator */}
      <PitchIndicator pitchData={pitchData} />

      {/* Guitar Headstock */}
      <GuitarHeadstock
        pitchData={pitchData}
        selectedString={selectedString}
        onStringClick={playReferenceNote}
        isListening={isListening}
      />

      {/* String buttons bar */}
      <div className="string-buttons">
        {STANDARD_TUNING.map((s, i) => {
          const isDetected =
            isListening &&
            pitchData.isActive &&
            pitchData.note === s.note &&
            pitchData.octave === s.octave;
          const isTunedString = isDetected && Math.abs(pitchData.cents) <= 5;

          return (
            <button
              key={i}
              className={`string-btn ${isDetected ? 'detected' : ''} ${isTunedString ? 'tuned' : ''} ${selectedString === i ? 'playing' : ''}`}
              onClick={() => playReferenceNote(i)}
            >
              <span className="string-btn-note">{s.label}</span>
              <span className="string-btn-freq">{s.frequency.toFixed(0)}</span>
            </button>
          );
        })}
      </div>

      {/* Main control button */}
      <button
        className={`control-btn ${isListening ? 'listening' : ''} ${isTuned ? 'tuned' : ''}`}
        onClick={isListening ? stopListening : startListening}
      >
        {isListening ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
        <span>{isListening ? 'Arrêter' : 'Accorder'}</span>
      </button>

      {/* Volume indicator */}
      {isListening && (
        <div className="volume-bar-container">
          <div className="volume-bar">
            <div
              className="volume-fill"
              style={{
                width: `${Math.max(0, Math.min(100, ((pitchData.volume + 60) / 60) * 100))}%`,
              }}
            />
          </div>
          <span className="volume-label">
            {pitchData.isActive ? 'Signal détecté' : 'En écoute...'}
          </span>
        </div>
      )}

      {/* Mode indicator */}
      <div className="mode-indicator">
        <div className={`mode-dot ${isListening ? 'active' : ''}`} />
        <span>Mode Auto</span>
      </div>
    </div>
  );
}
