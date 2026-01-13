import { useEffect, useRef, useState, useCallback } from 'react';

interface UseHandsFreeSpeechOptions {
  enabled: boolean;
  silenceMs?: number; // default 2500
  autoSend?: boolean; // default true
  onTextUpdate: (text: string) => void;
  onAutoSend: (text: string) => void;
  onStop?: () => void; // called when recognition ends
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
  autoSend = true,
  onTextUpdate,
  onAutoSend,
  onStop,
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
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const currentTranscriptRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);
  const handlersAttachedRef = useRef<boolean>(false);
  const stateRef = useRef<'idle' | 'starting' | 'listening' | 'stopping'>('idle');

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

  // Clear stop timeout
  const clearStopTimeout = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
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
      console.debug('Recognition onstart fired, current state:', stateRef.current);
      
      // If we're in 'stopping' state, ignore onstart (stop was called before start completed)
      if (stateRef.current === 'stopping') {
        console.debug('onstart: ignoring, state is stopping');
        return;
      }
      
      // Only transition to listening if we're in 'starting' state
      if (stateRef.current !== 'starting') {
        console.debug('onstart: unexpected state, ignoring:', stateRef.current);
        return;
      }
      
      stateRef.current = 'listening';
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
        // Don't reset state here - let onend handle it so onStop callback is called
        console.debug('ignored aborted');
        return;
      }
      
      if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
        setError('Microphone blocked');
        stateRef.current = 'idle';
        setListening(false);
        isListeningRef.current = false;
        onDisable();
      } else if (event.error === 'no-speech') {
        // This is normal, just continue listening (state stays 'listening')
      } else {
        // Other errors - reset state to idle
        console.debug('Recognition error, resetting state:', event.error);
        stateRef.current = 'idle';
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
      console.debug('Recognition onend fired, current state:', stateRef.current);
      
      // Clear the fallback timeout since onend fired
      clearStopTimeout();
      
      // Transition to idle and call onStop if we're not already idle
      // onend fires after abort() or stop(), so we should always transition to idle
      if (stateRef.current !== 'idle') {
        stateRef.current = 'idle';
        setListening(false);
        isListeningRef.current = false;
        // Call onStop callback if provided (for PTT mode)
        if (onStop) {
          console.debug('onend: calling onStop callback');
          onStop();
        }
      } else {
        console.debug('onend: already idle, still calling onStop if provided');
        // Even if already idle, still call onStop (might have been reset by error handler)
        if (onStop) {
          onStop();
        }
      }
      // Do not auto-restart - user must explicitly start via gesture
    };

    handlersAttachedRef.current = true;
  }, [isVideoPlaying, pauseVideo, onTextUpdate, resetSilenceTimer, onDisable, onStop]);

  // Start recognition (must be called from user gesture)
  const startRecognition = useCallback(() => {
    if (!supported) {
      console.debug('startRecognition: not supported');
      setError('Voice not supported in this browser');
      return;
    }

    // Guard against double-start using state machine - only start if idle
    if (stateRef.current !== 'idle') {
      console.debug('startRecognition: not idle, state:', stateRef.current);
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
    
    stateRef.current = 'starting';
    try {
      recognition.start();
      // listening state will be set by onstart event (state -> 'listening')
      // If start fails, onstart won't fire, so we handle it in catch
    } catch (e: any) {
      console.debug('startRecognition error:', e);
      
      // If recognition is already started, stop it first to clean up
      if (e.name === 'InvalidStateError' || (e.message && e.message.includes('already started'))) {
        console.debug('startRecognition: recognition already started, stopping first');
        try {
          recognition.stop();
        } catch (stopError) {
          // Ignore stop errors
        }
      }
      
      // Reset state on error
      stateRef.current = 'idle';
      setError('Failed to start voice recognition');
      setListening(false);
      isListeningRef.current = false;
    }
  }, [supported, ensureRecognition, attachHandlers]);

  // Stop recognition
  const stopRecognition = useCallback(() => {
    // Guard: if already idle, return (nothing to stop)
    if (stateRef.current === 'idle') {
      console.debug('stopRecognition: already idle');
      return;
    }

    // Guard: if already stopping, return (avoid duplicate stops)
    if (stateRef.current === 'stopping') {
      console.debug('stopRecognition: already stopping');
      return;
    }

    console.debug('stopRecognition called, state:', stateRef.current);
    
    // Clear any existing stop timeout
    clearStopTimeout();
    
    // Can stop from 'starting' or 'listening' state
    stateRef.current = 'stopping';
    
    if (recognitionRef.current) {
      try {
        // Use abort() for immediate stop (more reliable than stop() for PTT)
        // abort() immediately stops recognition and fires onend
        if (recognitionRef.current.abort) {
          recognitionRef.current.abort();
        } else {
          recognitionRef.current.stop();
        }
        clearSilenceTimer();
        
        // Fallback: if onend doesn't fire within 200ms, manually trigger onStop
        // This ensures transcript is sent even if onend is delayed or doesn't fire
        stopTimeoutRef.current = setTimeout(() => {
          console.debug('stopRecognition: onend timeout, manually triggering onStop');
          if (stateRef.current === 'stopping') {
            stateRef.current = 'idle';
            setListening(false);
            isListeningRef.current = false;
            if (onStop) {
              onStop();
            }
          }
          clearStopTimeout();
        }, 200);
      } catch (e) {
        console.error('Error stopping recognition:', e);
        // Even if stop/abort fails, reset state immediately and call onStop
        clearStopTimeout();
        stateRef.current = 'idle';
        setListening(false);
        isListeningRef.current = false;
        // Call onStop immediately if it exists (fallback if onend doesn't fire)
        if (onStop) {
          onStop();
        }
      }
    } else {
      // No recognition instance, reset state immediately
      clearStopTimeout();
      stateRef.current = 'idle';
      setListening(false);
      isListeningRef.current = false;
    }
  }, [onStop]);

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
    if (!enabled && stateRef.current !== 'idle' && recognitionRef.current) {
      try {
        // Try abort first (more forceful than stop)
        if (recognitionRef.current.abort) {
          recognitionRef.current.abort();
        } else {
          recognitionRef.current.stop();
        }
      } catch (e) {
        // Ignore errors (aborted is expected)
      }
      stateRef.current = 'idle';
      setListening(false);
      isListeningRef.current = false;
      clearSilenceTimer();
      clearStopTimeout();
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
