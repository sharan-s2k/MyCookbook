import { useEffect, useRef, useState, useCallback } from 'react';

interface UseHandsFreeSpeechOptions {
  enabled: boolean;
  silenceMs?: number; // default 2500
  onTextUpdate: (text: string) => void;
  onAutoSend: (text: string) => void;
  onDisable: () => void;
  pauseVideo?: () => void;
  resumeVideo?: () => void;
  isVideoPlaying?: () => boolean;
  enableTTS?: boolean; // default true
  speakText?: (text: string) => void; // optional override
}

interface UseHandsFreeSpeechReturn {
  supported: boolean;
  listening: boolean;
  error?: string;
  startRecognition: () => void;
  stopRecognition: () => void;
  pauseRecognition: () => void;
  resumeRecognition: () => void;
}

export function useHandsFreeSpeech({
  enabled,
  silenceMs = 2500,
  onTextUpdate,
  onAutoSend,
  onDisable,
  pauseVideo,
  resumeVideo,
  isVideoPlaying,
  enableTTS = true,
  speakText,
}: UseHandsFreeSpeechOptions): UseHandsFreeSpeechReturn {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const currentTranscriptRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);
  const handlersAttachedRef = useRef<boolean>(false);

  // Check if SpeechRecognition is supported
  const supported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 
    'webkitSpeechRecognition' in window
  );

  // Helper to get SpeechRecognition constructor
  const getSpeechRecognition = () => {
    if (!supported) return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  };

  // Clear silence timer
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // Reset silence timer
  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const text = currentTranscriptRef.current.trim();
      
      // Handle special commands
      const normalized = text.toLowerCase();
      
      if (normalized === 'cancel') {
        onTextUpdate('');
        currentTranscriptRef.current = '';
        clearSilenceTimer();
        return;
      }
      
      if (
        normalized === 'stop hands free' ||
        normalized === 'stop hands-free' ||
        normalized === 'turn off hands free' ||
        normalized === 'turn off hands-free'
      ) {
        onDisable();
        currentTranscriptRef.current = '';
        onTextUpdate('');
        clearSilenceTimer();
        return;
      }
      
      // Auto-send if there's text
      if (text) {
        onAutoSend(text);
        currentTranscriptRef.current = '';
      }
      
      clearSilenceTimer();
    }, silenceMs);
  }, [silenceMs, onTextUpdate, onAutoSend, onDisable]);

  // Ensure recognition instance exists (lazy initialization)
  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    if (!supported) {
      return null;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      return null;
    }

    // Create recognition instance lazily
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognitionRef.current = recognition;
    handlersAttachedRef.current = false;
    return recognition;
  }, [supported]);

  // Attach handlers to recognition instance (once)
  const attachHandlers = useCallback((recognition: any) => {
    if (handlersAttachedRef.current) {
      return; // Handlers already attached
    }

    recognition.onstart = () => {
      console.debug('Recognition onstart fired');
      setListening(true);
      isListeningRef.current = true;
      setError(undefined);
      isPausedRef.current = false;
      
      // Pause video if playing
      if (isVideoPlaying && isVideoPlaying()) {
        wasPlayingRef.current = true;
        if (pauseVideo) {
          pauseVideo();
        }
      } else {
        wasPlayingRef.current = false;
      }
    };

    recognition.onerror = (event: any) => {
      console.debug('Recognition onerror fired:', event.error);
      
      if (event.error === 'aborted') {
        // Ignore aborted - it's expected when stopping/pausing
        console.debug('ignored aborted');
        // Do not surface as error or change listening state
        return;
      }
      
      if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
        setError('Microphone blocked');
        setListening(false);
        isListeningRef.current = false;
        onDisable();
      } else if (event.error === 'no-speech') {
        // This is normal, just continue listening
      } else {
        setError(`Recognition error: ${event.error}`);
        setListening(false);
        isListeningRef.current = false;
      }
    };

    recognition.onresult = (event: any) => {
      // Build full transcript from all results
      let fullTranscript = '';
      let hasFinal = false;

      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          hasFinal = true;
        }
      }

      currentTranscriptRef.current = fullTranscript;
      onTextUpdate(fullTranscript);

      // Reset silence timer on final results only
      if (hasFinal) {
        resetSilenceTimer();
      }
    };

    recognition.onend = () => {
      console.debug('Recognition onend fired');
      setListening(false);
      isListeningRef.current = false;
      // Do not auto-restart - user must explicitly start via gesture
    };

    handlersAttachedRef.current = true;
  }, [isVideoPlaying, pauseVideo, onTextUpdate, resetSilenceTimer, onDisable]);

  // Start recognition (must be called from user gesture)
  const startRecognition = useCallback(() => {
    if (!supported) {
      console.debug('startRecognition: not supported');
      setError('Voice not supported in this browser');
      return;
    }

    // Guard against double-start
    if (isListeningRef.current) {
      console.debug('startRecognition: already listening, ignoring');
      return;
    }

    console.debug('startRecognition called');

    const recognition = ensureRecognition();
    if (!recognition) {
      console.debug('startRecognition: failed to create recognition');
      setError('Voice not supported in this browser');
      return;
    }

    // Attach handlers if not already attached
    attachHandlers(recognition);
    
    try {
      recognition.start();
      // listening state will be set by onstart event
    } catch (e: any) {
      console.debug('startRecognition error:', e);
      if (e.message && e.message.includes('already started')) {
        // Recognition is already running
        console.debug('Recognition already started');
        isListeningRef.current = true;
        setListening(true);
      } else {
        setError('Failed to start voice recognition');
        setListening(false);
        isListeningRef.current = false;
      }
    }
  }, [supported, ensureRecognition, attachHandlers]);

  // Stop recognition
  const stopRecognition = useCallback(() => {
    // Guard: if not listening, return
    if (!isListeningRef.current) {
      console.debug('stopRecognition: not listening, ignoring');
      return;
    }

    console.debug('stopRecognition called');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setListening(false);
        isListeningRef.current = false;
        clearSilenceTimer();
      } catch (e) {
        console.error('Error stopping recognition:', e);
        // Even if stop fails, update state
        setListening(false);
        isListeningRef.current = false;
      }
    }
  }, []);

  // Pause recognition (used during TTS)
  const pauseRecognition = useCallback(() => {
    // Only pause if hands-free is enabled and listening
    if (!enabled || !isListeningRef.current) {
      return;
    }

    if (recognitionRef.current && !isPausedRef.current) {
      try {
        recognitionRef.current.stop();
        isPausedRef.current = true;
        setListening(false);
        isListeningRef.current = false;
      } catch (e) {
        console.error('Error pausing recognition:', e);
      }
    }
  }, [enabled]);

  // Resume recognition (used after TTS)
  const resumeRecognition = useCallback(() => {
    // Only resume if hands-free is enabled and paused
    if (!enabled || !isPausedRef.current) {
      return;
    }

    if (recognitionRef.current && isPausedRef.current) {
      // Guard against double-start
      if (isListeningRef.current) {
        return;
      }

      try {
        recognitionRef.current.start();
        isPausedRef.current = false;
        // listening state will be set by onstart event
      } catch (e) {
        console.error('Error resuming recognition:', e);
        isPausedRef.current = false;
      }
    }
  }, [enabled]);

  // Clean up when disabled (only stop if actually listening)
  useEffect(() => {
    if (!enabled && isListeningRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore errors (aborted is expected)
      }
      setListening(false);
      isListeningRef.current = false;
      clearSilenceTimer();
    }
  }, [enabled]);

  return {
    supported,
    listening,
    error,
    startRecognition,
    stopRecognition,
    pauseRecognition,
    resumeRecognition,
  };
}
