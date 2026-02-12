import { useRef, useState, useCallback, useEffect } from 'react';
import { PitchDetector } from 'pitchy';

export interface PitchData {
  frequency: number;
  clarity: number;
  note: string;
  octave: number;
  cents: number;
  detune: number;
  targetFrequency: number;
  isActive: boolean;
  volume: number;
}

export interface GuitarString {
  note: string;
  octave: number;
  frequency: number;
  label: string;
  stringNumber: number;
}

export const STANDARD_TUNING: GuitarString[] = [
  { note: 'E', octave: 4, frequency: 329.63, label: 'E', stringNumber: 1 },
  { note: 'B', octave: 3, frequency: 246.94, label: 'B', stringNumber: 2 },
  { note: 'G', octave: 3, frequency: 196.00, label: 'G', stringNumber: 3 },
  { note: 'D', octave: 3, frequency: 146.83, label: 'D', stringNumber: 4 },
  { note: 'A', octave: 2, frequency: 110.00, label: 'A', stringNumber: 5 },
  { note: 'E', octave: 2, frequency: 82.41, label: 'E', stringNumber: 6 },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function frequencyToNote(freq: number): { note: string; octave: number; cents: number } {
  const semitones = 12 * Math.log2(freq / 440);
  const roundedSemitones = Math.round(semitones);
  const cents = (semitones - roundedSemitones) * 100;
  const noteIndex = ((roundedSemitones % 12) + 12 + 9) % 12; // A = index 9 from C
  const octave = Math.floor((roundedSemitones + 9) / 12) + 4;
  return { note: NOTE_NAMES[noteIndex], octave, cents };
}

function findClosestString(freq: number): GuitarString & { cents: number } {
  let closest = STANDARD_TUNING[0];
  let minCents = Infinity;

  for (const str of STANDARD_TUNING) {
    const cents = 1200 * Math.log2(freq / str.frequency);
    if (Math.abs(cents) < Math.abs(minCents)) {
      minCents = cents;
      closest = str;
    }
  }

  return { ...closest, cents: minCents };
}

export function usePitchDetection() {
  const [pitchData, setPitchData] = useState<PitchData>({
    frequency: 0,
    clarity: 0,
    note: '-',
    octave: 0,
    cents: 0,
    detune: 0,
    targetFrequency: 0,
    isActive: false,
    volume: -Infinity,
  });
  const [isListening, setIsListening] = useState(false);
  const [selectedString, setSelectedString] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectorRef = useRef<PitchDetector<Float32Array> | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);

  // Smoothing refs
  const smoothedFreqRef = useRef<number>(0);
  const smoothedCentsRef = useRef<number>(0);
  const lastValidFreqRef = useRef<number>(0);
  const silenceCounterRef = useRef<number>(0);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      const audioContext = new AudioContext({ sampleRate: 48000 });
      const source = audioContext.createMediaStreamSource(stream);

      // Lowpass filter to remove high-frequency noise
      const lowpass = audioContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1200;
      lowpass.Q.value = 0.7;

      // Highpass to remove rumble
      const highpass = audioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 60;
      highpass.Q.value = 0.7;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.1;

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(analyser);

      const bufferLength = analyser.fftSize;
      const buffer = new Float32Array(bufferLength);
      const detector = PitchDetector.forFloat32Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      detectorRef.current = detector;
      bufferRef.current = buffer;
      smoothedFreqRef.current = 0;
      smoothedCentsRef.current = 0;
      silenceCounterRef.current = 0;

      setIsListening(true);
      detect();
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaStreamRef.current = null;
    detectorRef.current = null;
    bufferRef.current = null;
    setIsListening(false);
    setPitchData((prev) => ({ ...prev, isActive: false, frequency: 0, note: '-', cents: 0 }));
  }, []);

  const detect = useCallback(() => {
    const analyser = analyserRef.current;
    const detector = detectorRef.current;
    const buffer = bufferRef.current;
    const audioContext = audioContextRef.current;

    if (!analyser || !detector || !buffer || !audioContext) return;

    analyser.getFloatTimeDomainData(buffer);

    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    const volumeDb = 20 * Math.log10(Math.max(rms, 1e-10));

    const SILENCE_THRESHOLD = -45;
    const CLARITY_THRESHOLD = 0.90;

    if (volumeDb < SILENCE_THRESHOLD) {
      silenceCounterRef.current++;
      if (silenceCounterRef.current > 15) {
        smoothedFreqRef.current = 0;
        smoothedCentsRef.current = 0;
        setPitchData((prev) => ({
          ...prev,
          isActive: false,
          volume: volumeDb,
          frequency: 0,
          note: '-',
          cents: 0,
          detune: 0,
        }));
      }
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    silenceCounterRef.current = 0;
    const [pitch, clarity] = detector.findPitch(buffer, audioContext.sampleRate);

    if (clarity > CLARITY_THRESHOLD && pitch > 60 && pitch < 1200) {
      // Exponential smoothing on frequency
      const alpha = 0.3;
      if (smoothedFreqRef.current === 0 || Math.abs(pitch - smoothedFreqRef.current) > 20) {
        smoothedFreqRef.current = pitch;
      } else {
        smoothedFreqRef.current = alpha * pitch + (1 - alpha) * smoothedFreqRef.current;
      }

      const freq = smoothedFreqRef.current;
      lastValidFreqRef.current = freq;
      const noteInfo = frequencyToNote(freq);
      const closestString = findClosestString(freq);

      // Smooth cents
      const centsAlpha = 0.25;
      smoothedCentsRef.current =
        centsAlpha * closestString.cents + (1 - centsAlpha) * smoothedCentsRef.current;

      setPitchData({
        frequency: freq,
        clarity,
        note: closestString.note,
        octave: closestString.octave,
        cents: smoothedCentsRef.current,
        detune: noteInfo.cents,
        targetFrequency: closestString.frequency,
        isActive: true,
        volume: volumeDb,
      });
    } else if (lastValidFreqRef.current > 0) {
      // Keep showing last valid data but mark as less active
      setPitchData((prev) => ({ ...prev, volume: volumeDb, clarity }));
    }

    animFrameRef.current = requestAnimationFrame(detect);
  }, []);

  // Start detection loop when listening begins
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const playReferenceNote = useCallback(
    async (stringIndex: number) => {
      const string = STANDARD_TUNING[stringIndex];
      if (!string) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Guitar-like tone
      osc.type = 'triangle';
      osc.frequency.value = string.frequency;

      filter.type = 'lowpass';
      filter.frequency.value = string.frequency * 4;
      filter.Q.value = 1;

      // ADSR envelope
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 2.0);

      setSelectedString(stringIndex);
      setTimeout(() => setSelectedString(null), 2000);

      osc.onended = () => ctx.close();
    },
    [],
  );

  return {
    pitchData,
    isListening,
    selectedString,
    startListening,
    stopListening,
    playReferenceNote,
    setSelectedString,
  };
}
