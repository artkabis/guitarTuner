import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';

// Définition du type pour les cordes de guitare
type GuitarStringMap = {
  [key: string]: number;
};

// Fréquences standards des cordes d'une guitare folk
const GUITAR_STRINGS: GuitarStringMap = {
  'E2': 82.41, // Mi grave (6e corde)
  'A2': 110.00, // La (5e corde)
  'D3': 146.83, // Ré (4e corde)
  'G3': 196.00, // Sol (3e corde)
  'B3': 246.94, // Si (2e corde)
  'E4': 329.63, // Mi aigu (1re corde)
};

// Type pour le statut d'accordage
type TuningStatus = 'waiting' | 'flat' | 'sharp' | 'tuned' | 'very-flat' | 'very-sharp' | 'almost-tuned';

// Type pour la corde la plus proche
interface ClosestString {
  name: string;
  frequency: number;
}

// Interface pour les fréquences stockées pour la moyenne glissante
interface FrequencyReading {
  frequency: number;
  timestamp: number;
}

// PARAMÈTRES OPTIMISÉS
// ===================

// Marge d'erreur acceptable en cents (1/100e de demi-ton)
const CENTS_PRECISION = 3; // Plus strict pour l'état 'tuned'
const ALMOST_TUNED_THRESHOLD = 8; // Seuil pour "presque accordé"

// Taille du buffer pour l'analyse (puissance de 2)
const ANALYSIS_SIZE = 16384; // Augmenté pour améliorer la précision des basses fréquences

// Seuil de volume minimal pour démarrer l'analyse (en dB)
const VOLUME_THRESHOLD = -52; // Légèrement ajusté 

// Nombre de trames où la fréquence doit être stable avant de l'afficher
const STABILITY_THRESHOLD = 5; // Augmenté pour plus de stabilité

// Seuil pour l'algorithme YIN (détection de pitch)
const YIN_THRESHOLD = 0.10; // Valeur plus stricte pour une meilleure détection

// Limites de fréquence pour la recherche
const MIN_DETECT_FREQ = 70; // Un peu sous E2
const MAX_DETECT_FREQ = 350; // Un peu au-dessus E4

// Paramètres pour la moyenne glissante
const MOVING_AVERAGE_WINDOW = 500; // ms
const MOVING_AVERAGE_MAX_READINGS = 10;

// Paramètres pour le traitement de l'attaque
const ATTACK_IGNORE_TIME = 120; // ms à ignorer après détection d'une nouvelle note
const ATTACK_VOLUME_THRESHOLD = -35; // dB - seuil pour détecter une attaque

// Paramètres pour filtres
const FILTER_Q = 1.5; // Facteur Q du filtre passe-bande (résonance)

// FONCTIONS UTILITAIRES
// ===================

// Convertir la différence de fréquence en cents
const freqToCents = (freq: number, targetFreq: number): number => {
  if (freq <= 0 || targetFreq <= 0) return 0;
  return Math.round(1200 * Math.log2(freq / targetFreq));
};

// Fonction pour déterminer la corde la plus proche de la fréquence détectée
const findClosestString = (freq: number): ClosestString | null => {
  if (freq <= 0) return null;

  let closestString: ClosestString | null = null;
  let minDifference = Infinity;

  Object.entries(GUITAR_STRINGS).forEach(([stringName, stringFreq]) => {
    // Calculer la différence en cents pour trouver la corde la plus proche musicalement
    const centsDifference = Math.abs(1200 * Math.log2(freq / stringFreq));

    if (centsDifference < minDifference) {
      minDifference = centsDifference;
      closestString = { name: stringName, frequency: stringFreq };
    }
  });

  // Ne retourner une correspondance que si elle est raisonnablement proche
  // (moins de 100 cents = 1 demi-ton d'erreur max pour identifier la corde)
  if (closestString && minDifference < 100) {
    return closestString;
  }
  return null;
};

// DÉTECTION DE FRÉQUENCE AMÉLIORÉE
// ===============================

// Algorithme YIN amélioré pour une meilleure précision
const findFundamentalFrequency = (
  buffer: Float32Array,
  sampleRate: number
): number => {
  const bufferSize = buffer.length;
  const yinBufferSize = Math.floor(bufferSize / 2);
  const yinBuffer = new Float32Array(yinBufferSize);

  // Conversion des limites de fréquence en périodes (indices dans le buffer)
  const minPeriod = Math.max(2, Math.floor(sampleRate / MAX_DETECT_FREQ));
  const maxPeriod = Math.min(yinBufferSize - 1, Math.floor(sampleRate / MIN_DETECT_FREQ));

  // Pré-traitement du signal - fenêtrage pour réduire les effets de bord
  const windowedBuffer = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    // Fenêtre de Hann pour un meilleur résultat spectral
    const windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / bufferSize));
    windowedBuffer[i] = buffer[i] * windowValue;
  }

  // Étape 1 & 2 de YIN: Fonction de différence et normalisation cumulative
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < yinBufferSize; tau++) {
    // Calculer la différence quadratique pour chaque délai tau
    let squaredDifference = 0;
    for (let i = 0; i < yinBufferSize; i++) {
      const delta = windowedBuffer[i] - windowedBuffer[i + tau];
      squaredDifference += delta * delta;
    }

    // Normalisation cumulative améliorée de YIN
    runningSum += squaredDifference;
    yinBuffer[tau] = (tau * squaredDifference) / (runningSum || 1); // Éviter division par zéro
  }

  // Étape 3 & 4 de YIN: Recherche du minimum absolu
  let bestPeriod = 0;
  let minValue = 1;
  let foundThreshold = false;

  // Rechercher le premier minimum local sous le seuil
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    if (yinBuffer[tau] < minValue) {
      minValue = yinBuffer[tau];
      bestPeriod = tau;
    }
    
    // Si on est sous le seuil et c'est un minimum local
    if (!foundThreshold && 
        yinBuffer[tau] < YIN_THRESHOLD && 
        tau > minPeriod && 
        yinBuffer[tau] < yinBuffer[tau-1] && 
        yinBuffer[tau] < yinBuffer[tau+1]) {
      foundThreshold = true;
      bestPeriod = tau;
      break; // On a trouvé un bon minimum
    }
  }

  // Si on n'a pas trouvé de minimum sous le seuil, on garde le minimum global
  if (!foundThreshold && minValue > YIN_THRESHOLD * 1.2) {
    // Pas de minimum acceptable trouvé
    return 0;
  }

  // Étape 5 de YIN: Interpolation parabolique pour une précision sub-échantillon
  if (bestPeriod > 0 && bestPeriod < yinBufferSize - 1) {
    const y1 = yinBuffer[bestPeriod - 1];
    const y2 = yinBuffer[bestPeriod];
    const y3 = yinBuffer[bestPeriod + 1];
    
    // Calcul du décalage pour trouver le vrai minimum entre les points discrets
    const denominator = 2 * (2 * y2 - y1 - y3);
    if (Math.abs(denominator) > 0.0001) { // Éviter division par presque-zéro
      const adjustment = (y3 - y1) / denominator;
      if (Math.abs(adjustment) < 1) { // Ajustement raisonnable
        bestPeriod += adjustment;
      }
    }
  }

  // Convertir la période en fréquence
  if (bestPeriod > 0) {
    const pitchInHz = sampleRate / bestPeriod;
    // Double vérification de la plage
    if (pitchInHz >= MIN_DETECT_FREQ * 0.95 && pitchInHz <= MAX_DETECT_FREQ * 1.05) {
      return pitchInHz;
    }
  }

  return 0; // Pas de fréquence valide détectée
};

// COMPOSANT PRINCIPAL
// =================

const GuitarTuner: React.FC = () => {
  // États du composant
  const [isListening, setIsListening] = useState<boolean>(false);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [detectedFreq, setDetectedFreq] = useState<number>(0);
  const [tuningStatus, setTuningStatus] = useState<TuningStatus>('waiting');
  const [cents, setCents] = useState<number>(0);
  const [volume, setVolume] = useState<number>(-Infinity);
  const [error, setError] = useState<string | null>(null);
  const [isAttack, setIsAttack] = useState<boolean>(false);
  const [accuracy, setAccuracy] = useState<number>(0); // 0-100%, pour l'affichage
  
  // Refs pour les objets audio
  const analyserRef = useRef<Tone.Analyser | null>(null);
  const micRef = useRef<Tone.UserMedia | null>(null);
  const meterRef = useRef<Tone.Meter | null>(null);
  const animationRef = useRef<number | null>(null);
  const synthRef = useRef<Tone.Synth | null>(null);
  
  // Refs pour filtres et traitement
  const filterRef = useRef<Tone.Filter | null>(null);
  const compressorRef = useRef<Tone.Compressor | null>(null);
  
  // Refs pour la logique de stabilité et l'attaque
  const lastStableFreqRef = useRef<number>(0);
  const stableCounterRef = useRef<number>(0);
  const attackTimeRef = useRef<number>(0);
  const frequencyReadingsRef = useRef<FrequencyReading[]>([]);
  const lastVolumeRef = useRef<number>(-Infinity);
  const lastNoteChangeTimeRef = useRef<number>(0);
  
  // État pour le son de référence
  const [playingNote, setPlayingNote] = useState<string | null>(null);

  // Initialisation du synthétiseur
  useEffect(() => {
    synthRef.current = new Tone.Synth({
      oscillator: {
        type: 'triangle8'  // Son plus riche qui ressemble davantage à une guitare
      },
      envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0.3,
        release: 2
      }
    }).toDestination();

    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
        synthRef.current = null;
      }
    };
  }, []);

  // Fonction pour calculer la moyenne glissante des fréquences récentes
  const calculateMovingAverage = (newFreq: number): number => {
    const now = Date.now();
    
    // Ajouter la nouvelle fréquence à la liste
    frequencyReadingsRef.current.push({
      frequency: newFreq,
      timestamp: now
    });
    
    // Filtrer les lectures trop anciennes
    frequencyReadingsRef.current = frequencyReadingsRef.current.filter(
      reading => now - reading.timestamp <= MOVING_AVERAGE_WINDOW
    );
    
    // Limiter le nombre de lectures pour éviter d'utiliser trop de mémoire
    if (frequencyReadingsRef.current.length > MOVING_AVERAGE_MAX_READINGS) {
      frequencyReadingsRef.current = frequencyReadingsRef.current.slice(
        frequencyReadingsRef.current.length - MOVING_AVERAGE_MAX_READINGS
      );
    }
    
    // Calculer la moyenne pondérée (les lectures plus récentes ont plus de poids)
    if (frequencyReadingsRef.current.length < 2) return newFreq;
    
    let totalWeight = 0;
    let weightedSum = 0;
    
    frequencyReadingsRef.current.forEach((reading, index) => {
      // Facteur de temporalité: plus récent = plus de poids
      const timeWeight = 1 - (now - reading.timestamp) / MOVING_AVERAGE_WINDOW;
      // Facteur de position: plus récent dans la liste = plus de poids
      const positionWeight = (index + 1) / frequencyReadingsRef.current.length;
      // Poids combiné
      const weight = (timeWeight + positionWeight) / 2;
      
      weightedSum += reading.frequency * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? weightedSum / totalWeight : newFreq;
  };

  // Fonction pour détecter une attaque (changement soudain de volume)
  const detectAttack = (currentVolume: number): boolean => {
    const volumeJump = currentVolume - lastVolumeRef.current;
    const now = Date.now();
    
    // Mise à jour de la référence pour la prochaine comparaison
    lastVolumeRef.current = currentVolume;
    
    // Considérer comme une attaque si:
    // 1. Le volume augmente rapidement (saut de plus de X dB)
    // 2. Le volume dépasse le seuil d'attaque
    // 3. On n'a pas détecté d'attaque récemment (éviter les doublons)
    if (volumeJump > 8 && currentVolume > ATTACK_VOLUME_THRESHOLD && 
        now - attackTimeRef.current > 300) {
      attackTimeRef.current = now;
      lastNoteChangeTimeRef.current = now;
      frequencyReadingsRef.current = []; // Réinitialiser l'historique lors d'une nouvelle attaque
      return true;
    }
    
    return false;
  };
  
  // Fonction pour ajuster le seuil de volume en fonction de la note détectée
  const getAdjustedVolumeThreshold = (detectedFrequency: number): number => {
    if (detectedFrequency <= 0) return VOLUME_THRESHOLD;
    
    // Seuils ajustés en fonction de la gamme de fréquences
    // Plus la fréquence est élevée, plus le seuil est bas (plus sensible)
    if (detectedFrequency > 250) {
      // Notes aiguës (E4, B3) - Plus sensible
      return VOLUME_THRESHOLD + 6; // 6dB plus sensible
    } else if (detectedFrequency > 150) {
      // Notes médium (G3, D3) - Sensibilité moyenne
      return VOLUME_THRESHOLD + 3; // 3dB plus sensible
    } else {
      // Notes graves (E2, A2) - Utiliser le seuil standard
      return VOLUME_THRESHOLD;
    }
  };
  
  // Fonction pour jouer une note de référence
  const playNote = (note: string, frequency: number): void => {
    if (playingNote && synthRef.current) {
      synthRef.current.triggerRelease();
    }

    // Démarrer Tone.js si nécessaire
    if (Tone.context.state !== 'running') {
      Tone.start().catch(err => console.error("Erreur lors du démarrage de Tone.js:", err));
    }

    if (synthRef.current) {
      synthRef.current.triggerAttack(frequency);
      setPlayingNote(note);
    }
  };

  // Fonction pour arrêter la lecture
  const stopNote = (): void => {
    if (playingNote && synthRef.current) {
      synthRef.current.triggerRelease();
      setPlayingNote(null);
    }
  };

  // Initialiser l'analyseur de fréquence et le microphone
  const initAudio = async (): Promise<void> => {
    // Réinitialisation des états
    setError(null);
    setIsListening(false);
    setTuningStatus('waiting');
    setDetectedNote(null);
    setDetectedFreq(0);
    setCents(0);
    setVolume(-Infinity);
    setIsAttack(false);
    setAccuracy(0);
    
    // Réinitialisation des refs
    lastStableFreqRef.current = 0;
    stableCounterRef.current = 0;
    attackTimeRef.current = 0;
    frequencyReadingsRef.current = [];
    lastVolumeRef.current = -Infinity;
    lastNoteChangeTimeRef.current = 0;
    
    try {
      // Démarrer le contexte audio
      await Tone.start();
      console.log('Tone.js started');

      // Vérifier la prise en charge du navigateur
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Votre navigateur ne prend pas en charge l'accès au microphone (getUserMedia).");
      }
      
      // Nettoyer les instances précédentes
      if (micRef.current) {
        console.log('Closing previous mic...');
        micRef.current.close(); 
      }
      if (analyserRef.current) {
        console.log('Disposing previous analyser...');
        analyserRef.current.dispose();
      }
      if (meterRef.current) {
        console.log('Disposing previous meter...');
        meterRef.current.dispose();
      }
      if (filterRef.current) {
        console.log('Disposing previous filter...');
        filterRef.current.dispose();
      }
      if (compressorRef.current) {
        console.log('Disposing previous compressor...');
        compressorRef.current.dispose();
      }
      
      // Créer le microphone UserMedia
      console.log('Creating UserMedia...');
      micRef.current = new Tone.UserMedia();
      
      // Demander l'accès au microphone
      console.log('Opening UserMedia...');
      await micRef.current.open();
      console.log('Microphone access granted.');
      
      // Créer les effets de traitement du signal
      // 1. Filtre passe-bande pour se concentrer sur la plage de fréquences de la guitare
      filterRef.current = new Tone.Filter({
        type: "bandpass",
        frequency: 200, // Centre approximatif des fréquences de guitare
        Q: FILTER_Q, // Largeur de bande
        rolloff: -24 // Pente de filtrage (dB/octave)
      });
      
      // 2. Compresseur pour lisser les attaques
      compressorRef.current = new Tone.Compressor({
        threshold: -30, // dB
        ratio: 4, // compression ratio
        attack: 0.003, // secondes
        release: 0.25, // secondes
        knee: 10 // dB
      });
      
      // Créer l'analyseur de forme d'onde (Waveform)
      analyserRef.current = new Tone.Analyser('waveform', ANALYSIS_SIZE);
      
      // Créer un analyseur de volume (Meter)
      meterRef.current = new Tone.Meter(0.8); // Paramètre de lissage pour éviter les sauts brusques
      
      // Chaîne de connexion:
      // Microphone -> Filtre -> Compresseur -> Analyseurs (meter et waveform)
      // Créer le filtre passe-bande
      filterRef.current = new Tone.Filter({
        type: "bandpass",
        frequency: 200, // Centre approximatif des fréquences de guitare
        Q: FILTER_Q, // Largeur de bande
        rolloff: -24 // Pente de filtrage (dB/octave)
      });
      
      // Créer un égaliseur pour compenser la sensibilité du micro selon les fréquences
      const eq = new Tone.EQ3({
        low: 0,       // Pas de boost pour les basses
        mid: 0,       // Pas de boost pour les médiums
        high: 4,      // Boost de 4dB pour les aigus
        lowFrequency: 220,   // Crossover graves/médiums (entre A3 et A2)
        highFrequency: 2200  // Crossover médiums/aigus
      });
      
      // 2. Compresseur pour lisser les attaques
      compressorRef.current = new Tone.Compressor({
        threshold: -30, // dB
        ratio: 4, // compression ratio
        attack: 0.003, // secondes
        release: 0.25, // secondes
        knee: 10 // dB
      });
      
      // Chaîne de traitement du signal améliorée
      micRef.current.chain(
        filterRef.current, 
        eq,                // Ajouter l'égaliseur dans la chaîne
        compressorRef.current, 
        meterRef.current
      );
      micRef.current.connect(analyserRef.current);
      
      console.log('Audio nodes connected.');

      // Fonction d'analyse récursive
      const analyzeAudio = (): void => {
        if (!analyserRef.current || !meterRef.current || !micRef.current || micRef.current.state !== 'started') {
            console.log('Analysis stopped - refs missing or mic not started.');
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
            return; 
        }

        try {
            // Obtenir les données de forme d'onde et le volume
            const waveformData = analyserRef.current.getValue();
            const currentVolume = meterRef.current.getValue() as number;
            
            // Mise à jour de l'état du volume
            setVolume(currentVolume);
            
            // Détecter si on est dans une phase d'attaque (transitoire)
            const newAttackDetected = detectAttack(currentVolume);
            if (newAttackDetected) {
                setIsAttack(true);
                // Réinitialiser la détection lors d'une nouvelle attaque
                stableCounterRef.current = 0;
                lastStableFreqRef.current = 0;
            } else if (isAttack && Date.now() - attackTimeRef.current > ATTACK_IGNORE_TIME) {
                // Sortie de la phase d'attaque après le délai
                setIsAttack(false);
            }
            
            // Vérifier si les données sont valides
            if (!(waveformData instanceof Float32Array) || waveformData.length === 0) {
              animationRef.current = requestAnimationFrame(analyzeAudio);
              return;
            }
            
            // Adapter le seuil de volume en fonction de la fréquence détectée
            const adaptiveThreshold = getAdjustedVolumeThreshold(lastStableFreqRef.current);
            
            // Traiter seulement si le volume est suffisant et qu'on n'est pas en phase d'attaque
            // ou si la phase d'attaque est terminée depuis un certain temps
            const now = Date.now();
            const isAttackPhaseOver = now - attackTimeRef.current > ATTACK_IGNORE_TIME;
            
            if (isFinite(currentVolume) && currentVolume > adaptiveThreshold && 
                ((!isAttack) || isAttackPhaseOver)) {
              
              // Détecter la fréquence fondamentale
              const fundamentalFreq = findFundamentalFrequency(waveformData, Tone.getContext().sampleRate);
              
              if (fundamentalFreq > 0) {
                // Appliquer la moyenne glissante pour stabiliser la fréquence
                const smoothedFreq = calculateMovingAverage(fundamentalFreq);
                
                // Logique de stabilité
                const tolerance = Math.max(0.5, lastStableFreqRef.current * 0.015); // Tolérance adaptative
                
                if (Math.abs(smoothedFreq - lastStableFreqRef.current) < tolerance) {
                    stableCounterRef.current++;
                } else {
                    // Si la fréquence change, réinitialiser le compteur et mémoriser la nouvelle fréquence
                    // Sauf si c'est un petit saut (éviter les réinitialisations sur fluctuations mineures)
                    if (lastStableFreqRef.current === 0 || 
                        Math.abs(smoothedFreq - lastStableFreqRef.current) > tolerance * 3) {
                        lastStableFreqRef.current = smoothedFreq;
                        stableCounterRef.current = 0;
                        // Si c'est un changement important de note, considérer comme une nouvelle note
                        if (lastStableFreqRef.current > 0 && 
                            Math.abs(1200 * Math.log2(smoothedFreq / lastStableFreqRef.current)) > 50) {
                            lastNoteChangeTimeRef.current = now;
                            frequencyReadingsRef.current = []; // Réinitialiser l'historique
                        }
                    } else {
                        // Petite variation mais pas suffisante pour réinitialiser complètement
                        lastStableFreqRef.current = 0.9 * lastStableFreqRef.current + 0.1 * smoothedFreq; // Mise à jour progressive
                        stableCounterRef.current = Math.max(0, stableCounterRef.current - 1); // Réduire la stabilité mais pas à zéro
                    }
                }

                // Mettre à jour l'affichage seulement si la fréquence est stable
                // et qu'on est après la phase d'attaque
                if (stableCounterRef.current >= STABILITY_THRESHOLD && 
                    now - lastNoteChangeTimeRef.current > ATTACK_IGNORE_TIME) {
                    
                    // Mise à jour de la fréquence détectée (stable)
                    setDetectedFreq(smoothedFreq);
                    
                    // Trouver la corde la plus proche
                    const closestString = findClosestString(smoothedFreq);
                    
                    if (closestString) {
                      setDetectedNote(closestString.name);
                      
                      // Calculer la différence en cents
                      const centsDiff = freqToCents(smoothedFreq, closestString.frequency);
                      setCents(centsDiff);
                      
                      // Calculer le niveau de précision pour l'interface (0-100%)
                      const absCents = Math.abs(centsDiff);
                      let newAccuracy = 100 - (absCents * 2); // 0 cents = 100%, 50 cents = 0%
                      newAccuracy = Math.max(0, Math.min(100, newAccuracy));
                      setAccuracy(newAccuracy);
                      
                      // Définir le statut d'accordage avec plus de nuances
                      if (absCents <= CENTS_PRECISION) {
                        setTuningStatus('tuned');
                      } else if (absCents <= ALMOST_TUNED_THRESHOLD) {
                        setTuningStatus('almost-tuned');
                      } else if (centsDiff < -ALMOST_TUNED_THRESHOLD) {
                        setTuningStatus(centsDiff < -25 ? 'very-flat' : 'flat');
                      } else if (centsDiff > ALMOST_TUNED_THRESHOLD) {
                        setTuningStatus(centsDiff > 25 ? 'very-sharp' : 'sharp');
                      }
                    } else {
                      // Fréquence stable détectée mais pas de corde correspondante
                      setDetectedNote(null);
                      setTuningStatus('waiting');
                      setCents(0);
                      setAccuracy(0);
                    }
                }
              } else {
                 // findFundamentalFrequency a retourné 0 (pas de pitch clair)
                 if (stableCounterRef.current < STABILITY_THRESHOLD) {
                    setTuningStatus('waiting');
                    setCents(0);
                    setAccuracy(0);
                 }
                 stableCounterRef.current = Math.max(0, stableCounterRef.current - 1);
              }
            } else {
              // Volume trop faible ou en phase d'attaque initiale
              if (stableCounterRef.current < STABILITY_THRESHOLD) {
                 setTuningStatus('waiting');
                 // Ne pas réinitialiser la note/freq tout de suite pour une meilleure UX
                 setCents(0);
                 setAccuracy(0);
              }
              // Décrémenter progressivement la stabilité si le volume est faible
              stableCounterRef.current = Math.max(0, stableCounterRef.current - 1);
            }
        } catch (analysisError) {
            console.error("Erreur pendant l'analyse audio:", analysisError);
        }
        
        // Boucler pour la prochaine trame d'animation
        if (micRef.current?.state === 'started') {
           animationRef.current = requestAnimationFrame(analyzeAudio);
        } else {
           animationRef.current = null;
        }
      };
      
      // Commencer l'analyse
      console.log('Starting analysis loop...');
      setIsListening(true);
      analyzeAudio();

    } catch (initError) {
      console.error("Erreur lors de l'initialisation audio:", initError);
      setError(initError instanceof Error ? initError.message : "Erreur inconnue lors de l'accès au microphone.");
      stopAudio();
    }
  };
  
  // Arrêter l'analyse audio et nettoyer les ressources
  const stopAudio = (): void => {
    console.log('Stopping audio...');
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // Déconnecter et nettoyer les nœuds audio
    if (micRef.current) {
        try {
            if (filterRef.current) micRef.current.disconnect(filterRef.current);
            if (analyserRef.current) micRef.current.disconnect(analyserRef.current);
            micRef.current.close();
        } catch (disconnectError) {
            console.error("Error disconnecting/closing mic:", disconnectError);
        }
    }

    // Disposer des effets et analyseurs
    [filterRef, compressorRef, meterRef, analyserRef].forEach(ref => {
      if (ref.current) {
        ref.current.dispose();
        ref.current = null;
      }
    });
    
    // Disposer de l'égaliseur si nécessaire
    try {
      const context = Tone.getContext();
      // Déconnecter tout ce qui pourrait rester
      context.rawContext.resume().then(() => {
        console.log("Audio context resumed for cleanup");
      });
    } catch (e) {
      console.error("Error during advanced cleanup:", e);
    }
    
    micRef.current = null;

    // Réinitialiser l'état de l'interface
    setIsListening(false);
    setTuningStatus('waiting');
    setDetectedNote(null);
    setDetectedFreq(0);
    setCents(0);
    setVolume(-Infinity);
    setIsAttack(false);
    setAccuracy(0);
    
    // Réinitialiser les refs de stabilité et d'attaque
    lastStableFreqRef.current = 0;
    stableCounterRef.current = 0;
    frequencyReadingsRef.current = [];
    console.log('Audio stopped and state reset.');
  };
  
  // Nettoyage lors du démontage du composant
  useEffect(() => {
    return () => {
      stopAudio();
      // Arrêter la lecture de note si en cours
      if (playingNote && synthRef.current) {
        synthRef.current.triggerRelease();
      }
    };
  }, []);
  
  // Ajuster la fréquence du filtre passe-bande en fonction de la note détectée
  useEffect(() => {
    if (detectedFreq > 0 && filterRef.current) {
      // Ajuster la fréquence centrale du filtre pour qu'elle corresponde à la note détectée
      // avec une marge pour capturer les harmoniques
      filterRef.current.frequency.value = Math.min(MAX_DETECT_FREQ, Math.max(MIN_DETECT_FREQ, detectedFreq * 1.2));
      
      // Ajuster le facteur Q (largeur) en fonction de la fréquence
      // Plus la fréquence est élevée, plus le filtre peut être étroit
      if (detectedFreq > 250) {
        filterRef.current.Q.value = FILTER_Q * 1.2; // Plus étroit pour les aigus
      } else if (detectedFreq < 100) {
        filterRef.current.Q.value = FILTER_Q * 0.8; // Plus large pour les graves
      } else {
        filterRef.current.Q.value = FILTER_Q;
      }
    }
  }, [detectedFreq]);
  
  // Calculer la rotation de l'aiguille en fonction des cents
  const needleRotation = (): string => {
    // Limiter la plage de l'aiguille à +/- 50 cents visuellement
    const limitedCents = Math.max(-50, Math.min(50, cents));
    // Définir l'angle maximal de l'aiguille
    const maxAngle = 45; 
    // Mapper les cents limités à l'angle avec une courbe légèrement non-linéaire
    // pour une meilleure précision autour de zéro
    const rotation = Math.sign(limitedCents) * Math.pow(Math.abs(limitedCents / 50), 0.85) * maxAngle;
    
    return `rotate(${rotation}deg)`;
  };
  
  // Calculer la couleur et le texte d'indicateur en fonction de la précision
  const getIndicatorStyle = (): { colorClass: string; text: string; detail: string; bgClass: string } => {
    switch (tuningStatus) {
      case 'tuned': 
        return { 
          colorClass: 'text-green-600 font-bold', 
          text: 'Parfaitement accordé!', 
          detail: `(${cents} cents)`,
          bgClass: 'bg-green-100'
        };
      case 'almost-tuned':
        return { 
          colorClass: 'text-yellow-500 font-semibold', 
          text: 'Presque accordé', 
          detail: `(${cents} cents)`,
          bgClass: 'bg-yellow-50'
        };
      case 'flat':
        return { 
          colorClass: 'text-orange-500', 
          text: 'Un peu grave', 
          detail: `(${cents} cents)`,
          bgClass: 'bg-orange-50'
        };
      case 'very-flat':
        return { 
          colorClass: 'text-red-600', 
          text: 'Trop grave', 
          detail: `(${cents} cents)`,
          bgClass: 'bg-red-50'
        };
      case 'sharp':
        return { 
          colorClass: 'text-orange-500', 
          text: 'Un peu aigu', 
          detail: `(+${cents} cents)`,
          bgClass: 'bg-orange-50'
        };
      case 'very-sharp':
        return { 
          colorClass: 'text-red-600', 
          text: 'Trop aigu', 
          detail: `(+${cents} cents)`,
          bgClass: 'bg-red-50'
        };
      case 'waiting': default: 
        return { 
          colorClass: 'text-gray-400', 
          text: isAttack ? 'Attaque détectée...' : 'En attente...', 
          detail: '',
          bgClass: 'bg-gray-50'
        };
    }
  };

  // Obtenir les classes de style pour l'aiguille
  const getNeedleClasses = (): string => {
    switch (tuningStatus) {
      case 'tuned': return 'bg-green-600 shadow-green-300';
      case 'almost-tuned': return 'bg-yellow-500 shadow-yellow-300';
      case 'flat':
      case 'sharp': return 'bg-orange-500 shadow-orange-300';
      case 'very-flat':
      case 'very-sharp': return 'bg-red-600 shadow-red-300';
      default: return 'bg-gray-400 shadow-gray-300';
    }
  };
  
  // Fonction pour générer les marqueurs de l'échelle
  const renderMarkers = (): React.ReactNode[] => {
    const markers: React.ReactNode[] = [];
    const numMarkers = 10;

    for (let i = 0; i <= numMarkers; i++) {
      const currentCents = -50 + i * 10;
      const isCenter = currentCents === 0;
      const isTenMarker = i % 5 === 0 && i !== 0 && i !== numMarkers;
      
      // Position en pourcentage sur l'échelle visuelle
      const percentPosition = i / numMarkers; 

      markers.push(
        <div 
          key={currentCents}
          className={`absolute bottom-0 transform -translate-x-1/2 
                     ${isCenter ? 'h-6 w-1 bg-blue-600' : 'h-4 w-0.5 bg-gray-400'}
                     ${isTenMarker ? 'h-5' : ''}`}
          style={{ 
            left: `${percentPosition * 100}%`,
          }}
        ></div>
      );
    }
    return markers;
  };
  
  // Afficher le volume sonore sous forme de texte
  const getVolumeText = (): string => {
    if (!isFinite(volume) || volume < -70) return "Silence";
    if (volume < -55) return "Très faible";
    if (volume < -40) return "Faible";
    if (volume < -25) return "Moyen";
    if (volume < -10) return "Fort";
    return "Très fort";
  };
  
  // Calculer la valeur de progressbar pour l'accordage
  const getTuningAccuracy = (): number => {
    if (tuningStatus === 'waiting') return 0;
    return accuracy;
  };

  // Générer la classe CSS pour l'indicateur de précision
  const getAccuracyColorClass = (): string => {
    const accuracyValue = getTuningAccuracy();
    if (accuracyValue >= 95) return 'bg-green-600';
    if (accuracyValue >= 85) return 'bg-green-500';
    if (accuracyValue >= 70) return 'bg-yellow-500';
    if (accuracyValue >= 50) return 'bg-orange-500';
    if (accuracyValue > 0) return 'bg-red-500';
    return 'bg-gray-300';
  };
  
  // Animation du halo "parfaitement accordé"
  const getPerfectTuningClass = (): string => {
    return tuningStatus === 'tuned' 
      ? 'animate-pulse bg-green-100 ring-4 ring-green-300 shadow-lg' 
      : '';
  };
  
  // Rendu JSX du composant
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
      <div className={`w-full max-w-md bg-white rounded-lg shadow-xl p-6 transition-all duration-500 ${getPerfectTuningClass()}`}>
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">Accordeur Guitare</h1>
        
        {/* Bouton Démarrer/Arrêter */}
        <div className="mb-8 flex justify-center">
          <button
            onClick={isListening ? stopAudio : initAudio}
            className={`px-8 py-3 rounded-full font-semibold text-lg text-white transition-all duration-300 ease-in-out transform hover:scale-105 ${
              isListening ? 'bg-red-600 hover:bg-red-700 shadow-md' : 'bg-blue-600 hover:bg-blue-700 shadow-md'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isListening ? "Arrêter l'écoute" : "Démarrer l'écoute"}
          </button>
        </div>
        
        {/* Affichage des erreurs */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md text-sm border border-red-200">
            <span className="font-semibold">Erreur:</span> {error}
          </div>
        )}
        
        {/* Affichage Note & Fréquence avec animations */}
        <div className={`mb-8 text-center h-28 flex flex-col justify-center transition-all duration-300 ${getIndicatorStyle().bgClass} rounded-lg`}>
          <div className={`text-7xl font-bold mb-1 h-20 flex items-center justify-center transition-colors duration-300 ${detectedNote ? 'text-blue-700' : 'text-gray-400'}`}>
            {detectedNote || <span>-</span>}
          </div>
          <div className="text-base text-gray-600 h-6">
            {detectedFreq > 0 
              ? `${detectedFreq.toFixed(1)} Hz ${isAttack ? '(stabilisation...)' : ''}` 
              : (isListening ? "Jouez une corde..." : "Cliquez pour démarrer")}
          </div>
          {isListening && (
            <div className="text-xs mt-1 text-gray-500 h-4">
              Volume: {getVolumeText()} ({isFinite(volume) ? Math.round(volume) : '-'} dB)
            </div>
          )}
        </div>
            
        {/* Nouveau: Barre de précision d'accordage */}
        <div className="mb-6">
          <div className="flex justify-between mb-1 text-xs text-gray-500">
            <span>Précision d'accordage</span>
            <span>{Math.round(getTuningAccuracy())}%</span>
          </div>
          <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ease-out ${getAccuracyColorClass()}`}
              style={{ width: `${getTuningAccuracy()}%` }}
            ></div>
          </div>
        </div>
            
        {/* Indicateur Visuel d'Accordage */}
        <div className="relative h-28 mb-6 flex flex-col justify-end items-center">
          {/* Statut textuel au-dessus */}
          <div className={`absolute top-0 left-0 right-0 text-center h-8 font-semibold text-lg ${getIndicatorStyle().colorClass} transition-colors duration-300`}>
            {getIndicatorStyle().text}
            <span className="text-sm ml-1 font-normal">{getIndicatorStyle().detail}</span>
          </div>
              
          {/* Échelle Visuelle */}
          <div className="relative w-full h-12 mb-2 bg-gradient-to-r from-red-100 via-green-100 to-red-100 rounded-lg overflow-hidden border border-gray-300 shadow-inner">
            {/* Zone verte centrale */}
            <div 
              className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 bg-green-200 opacity-70" 
              style={{ width: `${(CENTS_PRECISION * 2 / 100) * 100}%` }} 
            ></div>
                    
            {/* Zone jaune "presque accordé" */}
            <div 
              className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 bg-yellow-100 opacity-70" 
              style={{ width: `${(ALMOST_TUNED_THRESHOLD * 2 / 100) * 100}%` }} 
            ></div>
                    
            {/* Marqueurs */}
            <div className="absolute inset-0"> {renderMarkers()} </div>
                    
            {/* Aiguille avec animation améliorée */}
            {tuningStatus !== 'waiting' && isFinite(cents) && (
              <div 
                className={`absolute bottom-0 left-1/2 w-1.5 h-10 origin-bottom transition-transform duration-100 ease-out ${getNeedleClasses()}`}
                style={{ 
                  transform: `translateX(-50%) ${needleRotation()}`,
                  boxShadow: '0 0 10px rgba(0,0,0,0.5)', 
                }}
              >
                {/* Effet de brillance sur l'aiguille */}
                <div className="absolute inset-0 bg-white opacity-30 rounded-t-full"></div>     
              </div>
            )}
          </div>
               
          {/* Légendes sous l'échelle */}
          <div className="relative w-full text-xs text-gray-500 flex justify-between px-1 mt-1">
            <span>Grave (-50c)</span>
            <span className="font-bold text-blue-600">Juste</span>
            <span>Aigu (+50c)</span>
          </div>
        </div>
            
        {/* Barre de Volume - Version corrigée avec dégradé horizontal strict */}
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden my-6 border border-gray-300">
          {/* Application d'un style inline pour le dégradé pour assurer l'orientation correcte */}
          <div 
            style={{ 
              width: `${Math.max(0, Math.min(100, (volume - VOLUME_THRESHOLD) / (-10 - VOLUME_THRESHOLD) * 100))}%`, 
              height: '100%', 
              background: 'linear-gradient(to right, #4ade80, #facc15, #f87171)',
              transition: 'width 100ms ease-linear'
            }}
          >
          </div>
        </div>
    
        {/* Liste des Cordes Standard avec génération de sons */}
        <div className="text-center text-sm font-semibold mb-2 text-gray-700">Cordes Standard</div>
        <div className="grid grid-cols-6 gap-2 text-center"> 
          {Object.entries(GUITAR_STRINGS).reverse().map(([note, freq]) => (
            <div 
              key={note}
              className={`p-2 rounded-lg border transition-all duration-200 cursor-pointer ${
                detectedNote === note && tuningStatus === 'tuned'
                ? 'bg-green-100 border-green-400 font-bold ring-2 ring-green-300 shadow-md scale-105' 
                : detectedNote === note
                ? 'bg-blue-100 border-blue-400 font-bold ring-2 ring-blue-300' 
                : playingNote === note
                ? 'bg-green-100 border-green-400 font-bold ring-2 ring-green-300'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
              onClick={() => playingNote === note ? stopNote() : playNote(note, freq)}
            >
              <div className="text-lg">{note}</div>
              <div className="text-xs text-gray-500">{freq.toFixed(1)} Hz</div>
              {playingNote === note && (
                <div className="mt-1 text-xs text-green-600 font-medium">
                  ♪ Joue ♪
                </div>
              )}
            </div>
          ))}
        </div>
            
        {/* Bouton pour arrêter toute lecture de son */}
        {playingNote && (
          <div className="mt-4 flex justify-center">
            <button 
              onClick={stopNote}
              className="px-4 py-2 rounded-md bg-red-500 text-white font-medium hover:bg-red-600 transition-colors shadow-sm"
            >
              Arrêter le son
            </button>
          </div>
        )}
            
        {/* Mode avancé avec infos supplémentaires */}
        {isListening && detectedNote && (
          <div className="mt-4 px-3 py-2 bg-blue-50 rounded-md text-xs text-gray-600 border border-blue-100">
            <div className="flex justify-between">
              <span>Attaque détectée: {isAttack ? 'Oui' : 'Non'}</span>
              <span>Stabilité: {stableCounterRef.current}/{STABILITY_THRESHOLD}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Précision: {CENTS_PRECISION} cents</span>
              <span>Buffer: {ANALYSIS_SIZE} échantillons</span>
            </div>
          </div>
        )}
      </div>
          
      {/* Instructions / Conseils */}
      <div className="mt-6 text-sm text-gray-600 text-center max-w-md px-4">
        <p>Conseils: Pincez la corde clairement près du micro et laissez-la résonner. Évitez les bruits forts.</p>
        <p>L'aiguille et la couleur indiquent si la note est 
          <span className="text-green-600 font-semibold"> parfaitement accordée</span>, 
          <span className="text-yellow-600 font-semibold"> presque juste</span>, 
          <span className="text-orange-600 font-semibold"> un peu désaccordée</span> ou 
          <span className="text-red-600 font-semibold"> très désaccordée</span>.
        </p>
        <p className="mt-2">Cliquez sur une note de la grille pour l'entendre et accordez votre guitare en fonction.</p>
        <p className="mt-2 text-xs text-gray-500">L'algorithme ignore automatiquement l'attaque initiale de la corde pour une détection plus précise.</p>
      </div>
    </div>
  );
};
    
export default GuitarTuner;