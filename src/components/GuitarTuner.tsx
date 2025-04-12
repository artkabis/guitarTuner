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
type TuningStatus = 'waiting' | 'flat' | 'sharp' | 'tuned';

// Type pour la corde la plus proche
interface ClosestString {
  name: string;
  frequency: number;
}

// Marge d'erreur acceptable en cents (1/100e de demi-ton)
const CENTS_PRECISION = 5; // Plus strict pour l'état 'tuned'

// Taille du buffer pour l'analyse (puissance de 2)
// Une taille plus grande améliore la précision en fréquence (surtout pour les graves)
// mais augmente légèrement la latence. 8192 est un bon compromis.
const ANALYSIS_SIZE = 8192; 

// Seuil de volume minimal pour démarrer l'analyse (en dB)
// Ajustez si nécessaire en fonction du bruit ambiant et du micro
const VOLUME_THRESHOLD = -55; 

// Nombre de trames où la fréquence doit être stable avant de l'afficher
const STABILITY_THRESHOLD = 3;

// Seuil pour l'algorithme YIN (détection de pitch)
const YIN_THRESHOLD = 0.15;

// Limites de fréquence pour la recherche (évite la détection de bruits hors tessiture)
const MIN_DETECT_FREQ = 70; // Un peu sous E2
const MAX_DETECT_FREQ = 350; // Un peu au-dessus E4

// Convertir la différence de fréquence en cents
const freqToCents = (freq: number, targetFreq: number): number => {
  if (freq <= 0 || targetFreq <= 0) return 0;
  // Utiliser Math.round pour une meilleure répartition autour de 0
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

// Algorithme de détection de fréquence fondamentale (Pitch Detection) basé sur YIN simplifié
// Prend les données de forme d'onde (pas FFT)
const findFundamentalFrequency = (
  buffer: Float32Array,
  sampleRate: number
): number => {
  const bufferSize = buffer.length;
  // La moitié du buffer car on compare le début avec la suite
  const yinBufferSize = Math.floor(bufferSize / 2); 
  const yinBuffer = new Float32Array(yinBufferSize);

  // Conversion des limites de fréquence en périodes (indices dans le buffer)
  const minPeriod = Math.max(2, Math.floor(sampleRate / MAX_DETECT_FREQ));
  const maxPeriod = Math.min(yinBufferSize - 1, Math.floor(sampleRate / MIN_DETECT_FREQ));

  let bestPeriod = 0;
  let minDifference = Infinity;
  let foundThreshold = false;

  // Calcul de la fonction de différence (étape 1 & 2 de YIN)
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    let squaredDifference = 0;
    for (let i = 0; i < yinBufferSize; i++) {
      const delta = buffer[i] - buffer[i + tau];
      squaredDifference += delta * delta;
    }

    // Normalisation cumulative (étape 3 de YIN - simplifiée ici)
    let runningSum = 0;
    for (let i = 0; i < yinBufferSize; i++) {
        runningSum += buffer[i] * buffer[i] + buffer[i+tau] * buffer[i+tau];
    }
    // Éviter la division par zéro et stocker la différence normalisée
    yinBuffer[tau] = (runningSum === 0) ? 1 : (squaredDifference * tau) / runningSum;


    // Recherche du premier minimum local sous le seuil (étape 4 de YIN)
    if (tau > minPeriod) {
      // Est-ce un minimum local ? (plus bas que ses voisins immédiats)
      // Note: une comparaison simple suffit souvent si on prend le *premier* sous le seuil
      if (!foundThreshold && yinBuffer[tau] < YIN_THRESHOLD && yinBuffer[tau] < yinBuffer[tau - 1]) {
          // Si on trouve un point sous le seuil, on le prend comme candidat
          // On pourrait chercher le *vrai* minimum dans cette zone, mais souvent le premier est bon
          bestPeriod = tau;
          foundThreshold = true;
          // On continue la boucle pour trouver potentiellement un minimum encore plus bas
          // ou pour compléter le calcul du buffer pour le fallback
      }
    }
    
    // Garder une trace du minimum absolu comme fallback si aucun seuil n'est atteint
    if (yinBuffer[tau] < minDifference) {
        minDifference = yinBuffer[tau];
        // Si on n'a pas encore trouvé via le seuil, on met à jour le bestPeriod du fallback
        if (!foundThreshold) {
            bestPeriod = tau;
        }
    }
  }

  // Si on n'a trouvé aucun minimum sous le seuil, on utilise le minimum absolu trouvé
  // (peut être moins fiable, mais mieux que rien)
  // Note: La condition !foundThreshold est implicite car si on l'a trouvé, bestPeriod est déjà setté.

  // Interpolation Parabolique (étape 5 de YIN - améliore la précision)
  if (bestPeriod > minPeriod && bestPeriod < maxPeriod) { // Assurer qu'on a des voisins
    const y1 = yinBuffer[bestPeriod - 1];
    const y2 = yinBuffer[bestPeriod];
    const y3 = yinBuffer[bestPeriod + 1];
    // Calcul du décalage pour trouver le vrai minimum entre les points discrets
    const denominator = 2 * (2 * y2 - y1 - y3);
    if (denominator !== 0) {
        const adjustment = (y3 - y1) / denominator;
        if (Math.abs(adjustment) < 1) { // Ajustement raisonnable
            bestPeriod += adjustment;
        }
    }
  }

  // Convertir la période en fréquence
  if (bestPeriod > 0) {
    const pitchInHz = sampleRate / bestPeriod;
    // Vérifier si la fréquence est dans notre plage cible
    if (pitchInHz >= MIN_DETECT_FREQ && pitchInHz <= MAX_DETECT_FREQ) {
        return pitchInHz;
    }
  }

  // Si aucune période valide n'est trouvée ou si la fréquence est hors plage
  return 0; 
};


// Le Composant React
const GuitarTuner: React.FC = () => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [detectedFreq, setDetectedFreq] = useState<number>(0);
  const [tuningStatus, setTuningStatus] = useState<TuningStatus>('waiting');
  const [cents, setCents] = useState<number>(0);
  const [volume, setVolume] = useState<number>(-Infinity); // Initialiser à -Infinity ou très bas
  const [error, setError] = useState<string | null>(null);
  
  // Refs pour les objets Tone.js et l'animation
  const analyserRef = useRef<Tone.Analyser | null>(null);
  const micRef = useRef<Tone.UserMedia | null>(null);
  const meterRef = useRef<Tone.Meter | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Refs pour la logique de stabilité
  const lastStableFreqRef = useRef<number>(0);
  const stableCounterRef = useRef<number>(0);

  // Ajout du synthétiseur pour jouer les notes
  const synthRef = useRef<Tone.Synth | null>(null);
  const [playingNote, setPlayingNote] = useState<string | null>(null);

  // Initialisation du synthétiseur
  useEffect(() => {
    // Créer le synthétiseur une fois au chargement
    synthRef.current = new Tone.Synth({
      oscillator: {
        type: 'triangle'  // Un son plus doux qui ressemble à une corde de guitare
      },
      envelope: {
        attack: 0.005,    // Attaque rapide
        decay: 0.1,       // Decay court
        sustain: 0.3,     // Sustain modéré
        release: 2        // Relâchement lent pour simuler la résonance de la guitare
      }
    }).toDestination();

    // Nettoyer le synthétiseur au démontage
    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
        synthRef.current = null;
      }
    };
  }, []);

  // Fonction pour jouer une note
  const playNote = (note: string, frequency: number): void => {
    // Arrêter la note précédente si elle est en cours
    if (playingNote && synthRef.current) {
      synthRef.current.triggerRelease();
    }

    // Démarrer Tone.js au premier clic (requis par navigateurs pour interaction utilisateur)
    if (Tone.context.state !== 'running') {
      Tone.start().catch(err => console.error("Erreur lors du démarrage de Tone.js:", err));
    }

    // Jouer la nouvelle note
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
    // Réinitialiser l'état avant de commencer
    setError(null);
    setIsListening(false); // Mettre à false au début, puis true si succès
    setTuningStatus('waiting');
    setDetectedNote(null);
    setDetectedFreq(0);
    setCents(0);
    setVolume(-Infinity);
    lastStableFreqRef.current = 0;
    stableCounterRef.current = 0;

    try {
      // Démarrer le contexte audio (requis par certains navigateurs)
      await Tone.start();
      console.log('Tone.js started');

      // Vérifier la prise en charge du navigateur
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Votre navigateur ne prend pas en charge l'accès au microphone (getUserMedia).");
      }
      
      // Nettoyer les instances précédentes si elles existent
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
      
      // Créer le microphone UserMedia
      console.log('Creating UserMedia...');
      micRef.current = new Tone.UserMedia();
      
      // Demander l'accès au microphone
      console.log('Opening UserMedia...');
      await micRef.current.open();
      console.log('Microphone access granted.');
      
      // Créer l'analyseur de forme d'onde (Waveform)
      analyserRef.current = new Tone.Analyser('waveform', ANALYSIS_SIZE); 
      
      // Créer un analyseur de volume (Meter)
      meterRef.current = new Tone.Meter();
      
      // Connecter le microphone aux analyseurs
      micRef.current.connect(analyserRef.current);
      micRef.current.connect(meterRef.current);
      console.log('Audio nodes connected.');

      // Fonction d'analyse récursive
      const analyzeAudio = (): void => {
        // Vérifier si les éléments nécessaires existent et si le micro est actif
        if (!analyserRef.current || !meterRef.current || !micRef.current || micRef.current.state !== 'started') {
            console.log('Analysis stopped - refs missing or mic not started.');
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
            // Ne pas réinitialiser l'état ici pour éviter les clignotements si l'arrêt est temporaire
            return; 
        }

        try {
            // Obtenir les données de forme d'onde et le volume
            const waveformData = analyserRef.current.getValue();
            const currentVolume = meterRef.current.getValue() as number; // Peut être -Infinity
            setVolume(currentVolume);

            // Vérifier si les données sont valides (Float32Array)
            if (!(waveformData instanceof Float32Array) || waveformData.length === 0) {
              // console.log('Invalid waveform data');
              animationRef.current = requestAnimationFrame(analyzeAudio); // Continuer d'essayer
              return;
            }
            
            // Traiter seulement si le volume est suffisant
            if (isFinite(currentVolume) && currentVolume > VOLUME_THRESHOLD) {
              // Détecter la fréquence fondamentale
              const fundamentalFreq = findFundamentalFrequency(waveformData, Tone.getContext().sampleRate);
              
              if (fundamentalFreq > 0) {
                // Logique de stabilité
                // Tolérance de 2% pour considérer comme stable
                const tolerance = lastStableFreqRef.current * 0.02; 
                if (Math.abs(fundamentalFreq - lastStableFreqRef.current) < tolerance) {
                    stableCounterRef.current++;
                } else {
                    // Si la fréquence change, réinitialiser le compteur et mémoriser la nouvelle fréquence
                    lastStableFreqRef.current = fundamentalFreq;
                    stableCounterRef.current = 0;
                }

                // Mettre à jour l'affichage seulement si la fréquence est stable
                if (stableCounterRef.current >= STABILITY_THRESHOLD) {
                    setDetectedFreq(fundamentalFreq);
                    
                    // Trouver la corde la plus proche
                    const closestString = findClosestString(fundamentalFreq);
                    
                    if (closestString) {
                      setDetectedNote(closestString.name);
                      
                      // Calculer la différence en cents
                      const centsDiff = freqToCents(fundamentalFreq, closestString.frequency);
                      setCents(centsDiff);
                      
                      // Définir le statut d'accordage
                      if (Math.abs(centsDiff) <= CENTS_PRECISION) {
                        setTuningStatus('tuned');
                      } else if (centsDiff < -CENTS_PRECISION) { // Ajouter marge pour éviter chevauchement
                        setTuningStatus('flat');
                      } else if (centsDiff > CENTS_PRECISION) {
                        setTuningStatus('sharp');
                      } else {
                        // Dans la zone de précision mais pas exactement 'tuned'
                        // pourrait être jaune, mais géré par getNeedleColor
                        setTuningStatus('tuned'); // Simplifions: si dans la précision, c'est 'tuned'
                      }
                    } else {
                      // Fréquence stable détectée mais pas de corde correspondante trouvée
                      setDetectedNote(null);
                      setTuningStatus('waiting');
                      setCents(0);
                    }
                } 
                // Si pas encore stable, on ne met PAS à jour l'UI principale
                // (lastStableFreqRef est mis à jour, mais pas detectedFreq etc.)

              } else {
                 // findFundamentalFrequency a retourné 0 (pas de pitch clair)
                 // Si on vient juste de perdre le signal stable, attendre un peu avant de réinitialiser
                 if (stableCounterRef.current < STABILITY_THRESHOLD) {
                    setTuningStatus('waiting');
                    // Ne pas réinitialiser la note/freq affichée immédiatement
                    // setDetectedNote(null);
                    // setDetectedFreq(0); 
                    setCents(0);
                 }
                 stableCounterRef.current = 0; // Perdu le pitch, reset stabilité
                 lastStableFreqRef.current = 0;
              }
            } else {
              // Volume trop faible
              // Attendre un peu avant de réinitialiser l'affichage si on vient de perdre le volume
              if (stableCounterRef.current < STABILITY_THRESHOLD) {
                 setTuningStatus('waiting');
                 // Ne pas réinitialiser la note/freq affichée immédiatement
                 // setDetectedNote(null);
                 // setDetectedFreq(0);
                 setCents(0);
              }
              stableCounterRef.current = 0; // Perdu le volume, reset stabilité
              lastStableFreqRef.current = 0;
            }
        } catch (analysisError) {
            console.error("Erreur pendant l'analyse audio:", analysisError);
            // Optionnel: Afficher une erreur d'analyse à l'utilisateur
            // setError("Erreur lors de l'analyse audio."); 
            // Essayer de continuer si possible
        }
        
        // Boucler pour la prochaine trame d'animation
        if (micRef.current?.state === 'started') { // Double check avant de relancer
           animationRef.current = requestAnimationFrame(analyzeAudio);
        } else {
           animationRef.current = null; // Assurer l'arrêt si le micro s'est arrêté entre temps
        }
      };
      
      // Commencer l'analyse
      console.log('Starting analysis loop...');
      setIsListening(true); // Mettre à jour l'état seulement après succès
      analyzeAudio();

    } catch (initError) {
      console.error("Erreur lors de l'initialisation audio:", initError);
      setError(initError instanceof Error ? initError.message : "Erreur inconnue lors de l'accès au microphone.");
      stopAudio(); // Assurer l'arrêt propre en cas d'erreur d'init
    }
  };
  
  // Arrêter l'analyse audio et nettoyer les ressources
  const stopAudio = (): void => {
    console.log('Stopping audio...');
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      console.log('Animation frame cancelled.');
    }
    
    // Très important : Déconnecter les nœuds AVANT de fermer/dispose
    if (micRef.current) {
        try {
            if (analyserRef.current) {
                 micRef.current.disconnect(analyserRef.current);
                 console.log('Mic disconnected from analyser.');
            }
            if (meterRef.current) {
                 micRef.current.disconnect(meterRef.current);
                 console.log('Mic disconnected from meter.');
            }
            micRef.current.close(); // Ferme le flux du micro
            console.log('Microphone closed.');
        } catch (disconnectError) {
            console.error("Error disconnecting/closing mic:", disconnectError);
        }
    }

    if (meterRef.current) {
        meterRef.current.dispose();
        meterRef.current = null;
        console.log('Meter disposed.');
    }
    if (analyserRef.current) {
        analyserRef.current.dispose();
        analyserRef.current = null;
        console.log('Analyser disposed.');
    }
    
    micRef.current = null; // Assurer que la ref est nulle après arrêt

    // Réinitialiser l'état de l'interface
    setIsListening(false);
    setTuningStatus('waiting');
    setDetectedNote(null);
    setDetectedFreq(0);
    setCents(0);
    setVolume(-Infinity); // Réinitialiser le volume
    lastStableFreqRef.current = 0; // Réinitialiser la stabilité
    stableCounterRef.current = 0;
    console.log('Audio stopped and state reset.');
  };
  
  // Nettoyage lors du démontage du composant
  useEffect(() => {
    // Cette fonction de retour est exécutée lorsque le composant est démonté
    return () => {
      stopAudio();
      // Arrêter la lecture de note si en cours
      if (playingNote && synthRef.current) {
        synthRef.current.triggerRelease();
      }
    };
  }, []); // Le tableau vide signifie que l'effet ne s'exécute qu'au montage et le cleanup au démontage
  
  // Calculer la rotation de l'aiguille en fonction des cents
  const needleRotation = (): string => {
    // Limiter la plage de l'aiguille à +/- 50 cents visuellement
    const limitedCents = Math.max(-50, Math.min(50, cents));
    // Définir l'angle maximal de l'aiguille (par exemple 45 degrés pour -50/+50 cents)
    const maxAngle = 45; 
    // Mapper linéairement les cents limités à l'angle
    const rotation = (limitedCents / 50) * maxAngle;
    
    // On peut ajouter une "zone morte" si on veut que l'aiguille reste à 0
    // même si les cents sont très proches de 0 mais pas exactement 0.
    // Exemple: if (Math.abs(cents) <= 1) return 'rotate(0deg)';
    
    return `rotate(${rotation}deg)`;
  };
  
  // Calculer la couleur de l'aiguille/texte en fonction de la précision
  const getIndicatorStyle = (): { colorClass: string; text: string; detail: string } => {
    switch (tuningStatus) {
        case 'tuned': return { colorClass: 'text-green-500', text: 'Accordé !', detail: `(${cents} cents)` };
        case 'flat':
          return { colorClass: Math.abs(cents) < 15 ? 'text-yellow-500' : 'text-red-500', text: 'Trop grave', detail: `(${cents} cents)` };
        case 'sharp':
          return { colorClass: cents < 15 ? 'text-yellow-500' : 'text-red-500', text: 'Trop aigu', detail: `(+${cents} cents)` };
        case 'waiting': default: return { colorClass: 'text-gray-400', text: 'En attente...', detail: '' };
      }
  };

  const { colorClass: needleColorClass } = getIndicatorStyle(); // Pour l'aiguille
  
  // Fonction pour générer les marqueurs de l'échelle
  const renderMarkers = (): React.ReactNode[] => {
    const markers: React.ReactNode[] = [];
    const numMarkers = 10; // Nombre total de sections (-50 à +50 = 10 * 10 cents)

    for (let i = 0; i <= numMarkers; i++) {
      const currentCents = -50 + i * 10; // Cents correspondants (-50, -40, ..., 0, ..., +50)
      const isCenter = currentCents === 0;
      const isTenMarker = i % 5 === 0 && i !== 0 && i !== numMarkers; // Marqueur tous les 50 cents (-50, 0, +50)
      
      // Position en pourcentage sur l'échelle visuelle (0% à 100%)
      const percentPosition = i / numMarkers; 

      markers.push(
        <div 
          key={currentCents}
          className={`absolute bottom-0 transform -translate-x-1/2 
                     ${isCenter ? 'h-6 w-1 bg-blue-600' : 'h-4 w-0.5 bg-gray-400'}
                     ${isTenMarker ? 'h-5' : ''} `} // Optionnel: marqueurs plus longs tous les X cents
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
    if (!isFinite(volume) || volume < -70) return "Silence"; // Ajuster seuil silence si besoin
    if (volume < -55) return "Très faible";
    if (volume < -40) return "Faible";
    if (volume < -25) return "Moyen";
    if (volume < -10) return "Fort";
    return "Très fort";
  };
  
  // Rendu JSX du composant
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">Accordeur Guitare</h1>
        
        {/* Bouton Démarrer/Arrêter */}
        <div className="mb-8 flex justify-center">
          <button
            onClick={isListening ? stopAudio : initAudio}
            className={`px-8 py-3 rounded-full font-semibold text-lg text-white transition-all duration-200 ease-in-out transform hover:scale-105 ${
              isListening ? 'bg-red-600 hover:bg-red-700 shadow-md' : 'bg-blue-600 hover:bg-blue-700 shadow-md'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={false} // Simplifié pour éviter des cas limites
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
        
        {/* Affichage Note & Fréquence */}
        <div className="mb-8 text-center h-28 flex flex-col justify-center"> {/* Hauteur fixe */}
          <div className="text-7xl font-bold mb-1 h-20 flex items-center justify-center text-blue-700"> {/* Hauteur fixe */}
            {detectedNote || <span className="text-gray-400">-</span>}
          </div>
          <div className="text-base text-gray-600 h-6">
            {detectedFreq > 0 ? `${detectedFreq.toFixed(2)} Hz` : (isListening ? "Jouez une corde..." : "Cliquez pour démarrer")}
          </div>
          {isListening && (
            <div className="text-xs mt-1 text-gray-500 h-4">
              Volume: {getVolumeText()} ({isFinite(volume) ? Math.round(volume) : '-'} dB)
            </div>
            )}
            </div>
            
            {/* Indicateur Visuel d'Accordage */}
            <div className="relative h-28 mb-6 flex flex-col justify-end items-center">
                 {/* Statut textuel au-dessus */}
                 <div className={`absolute top-0 left-0 right-0 text-center h-8 font-semibold text-lg ${getIndicatorStyle().colorClass}`}>
                     {getIndicatorStyle().text}
                     <span className="text-sm ml-1 font-normal">{getIndicatorStyle().detail}</span>
                 </div>
              
                {/* Échelle Visuelle */}
                <div className="relative w-full h-10 mb-2 bg-gradient-to-r from-red-100 via-green-100 to-red-100 rounded-lg overflow-hidden border border-gray-300 shadow-inner">
                    {/* Zone verte centrale (plus subtile) */}
                    <div 
                      className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 bg-green-200 opacity-70" 
                      // Largeur basée sur CENTS_PRECISION (ex: 5 cents => 10% de l'échelle de +/- 50)
                      style={{ width: `${(CENTS_PRECISION * 2 / 100) * 100}%` }} 
                    ></div>
                    {/* Marqueurs */}
                    <div className="absolute inset-0"> {renderMarkers()} </div>
                    
                    {/* Aiguille */}
                    {tuningStatus !== 'waiting' && isFinite(cents) && (
                        <div 
                            className={`absolute bottom-0 left-1/2 w-1.5 h-full origin-bottom ${needleColorClass} transition-transform duration-100 ease-linear rounded-t-sm`}
                            style={{ 
                                transform: `translateX(-50%) ${needleRotation()}`,
                                boxShadow: '0 0 8px rgba(0,0,0,0.3)', 
                            }}
                        >
                           {/* Petit cercle à la base */}
                           <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-gray-600 rounded-full border-2 border-white"></div>
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
            
            {/* Barre de Volume */}
            <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden my-6 border border-gray-300">
              <div 
                  className="h-full bg-gradient-to-r from-green-300 via-yellow-300 to-red-400 transition-all duration-100 ease-linear"
                  // Normaliser le volume: -60dB (faible) à -10dB (fort) -> 0% à 100%
                  style={{ width: `${Math.max(0, Math.min(100, (volume - VOLUME_THRESHOLD) / (-10 - VOLUME_THRESHOLD) * 100))}%` }} 
              ></div>
            </div>
    
            {/* Liste des Cordes Standard avec génération de sons */}
            <div className="text-center text-sm font-semibold mb-2 text-gray-700">Cordes Standard</div>
            <div className="grid grid-cols-6 gap-2 text-center"> 
              {Object.entries(GUITAR_STRINGS).reverse().map(([note, freq]) => ( // Afficher E2 à gauche
                <div 
                  key={note}
                  className={`p-2 rounded border transition-colors duration-200 cursor-pointer ${
                    detectedNote === note 
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
          </div>
          
          {/* Instructions / Conseils */}
          <div className="mt-6 text-sm text-gray-600 text-center max-w-md px-4">
            <p>Conseils: Pincez la corde clairement près du micro et laissez-la résonner. Évitez les bruits forts.</p>
            <p>L'aiguille et la couleur indiquent si la note est juste (<span className="text-green-600 font-semibold">Accordé</span>), <span className="text-yellow-600 font-semibold">proche</span>, <span className="text-red-600 font-semibold">trop grave</span> ou <span className="text-red-600 font-semibold">trop aiguë</span>.</p>
            <p className="mt-2">Cliquez sur une note de la grille pour l'entendre et accordez votre guitare en fonction.</p>
          </div>
        </div>
      );
    };
    
    export default GuitarTuner;