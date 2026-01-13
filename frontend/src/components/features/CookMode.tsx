import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Mic, MicOff, ChevronUp, ChevronDown, Plus, Minus, Clock, CheckSquare, Square } from 'lucide-react';
import type { Recipe } from '../../types';
import { aiAPI } from '../../api/client';
import { useHandsFreeSpeech } from '../../hooks/useHandsFreeSpeech';

interface CookModeProps {
  recipe: Recipe;
  onExit: () => void;
}

interface Timer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
}

export function CookMode({ recipe, onExit }: CookModeProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pttEnabled, setPttEnabled] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [isEditingMultiplier, setIsEditingMultiplier] = useState(false);
  const [multiplierInput, setMultiplierInput] = useState('1');
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Timer[]>([]);
  const [customTimerMinutes, setCustomTimerMinutes] = useState('');
  const [showCustomTimer, setShowCustomTimer] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ type: 'user' | 'assistant'; text: string }>>([
    { type: 'assistant', text: 'Ready to cook! I can help you navigate steps, answer questions, and set timers.' }
  ]);
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const playerContainerRef = React.useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSpokenMessageIndexRef = useRef<number>(-1);
  const isSpaceDownRef = useRef<boolean>(false);
  const lastTranscriptRef = useRef<string>('');
  const sendCommandRef = useRef<(text: string) => void>(() => {});
  const pendingSendRef = useRef<boolean>(false);
  const lastKeyDownTimeRef = useRef<number>(0);

  const currentStep = recipe.steps[currentStepIndex];

  // Basic cleanup: lowercase, trim, remove punctuation, collapse spaces
  const basicCleanup = (text: string): string => {
    let cleaned = text.toLowerCase().trim();
    cleaned = cleaned.replace(/[^\w\s]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned;
  };

  // Normalize step number words ONLY (for pure navigation commands)
  const normalizeStepWordCommand = (text: string): string => {
    let normalized = text;
    
    // Number word to digit mapping
    const numberWords: { [key: string]: string } = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
      'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'
    };
    
    // Handle "step [number word]" patterns
    for (const [word, digit] of Object.entries(numberWords)) {
      // "step one" => "step 1"
      normalized = normalized.replace(new RegExp(`\\bstep ${word}\\b`, 'gi'), `step ${digit}`);
      // "go to step one" => "go to step 1"
      normalized = normalized.replace(new RegExp(`\\bgo to step ${word}\\b`, 'gi'), `go to step ${digit}`);
    }
    
    // Handle homophones after "step": to/too => 2, for => 4
    normalized = normalized.replace(/\bstep (to|too)\b/gi, 'step 2');
    normalized = normalized.replace(/\bstep for\b/gi, 'step 4');
    normalized = normalized.replace(/\bgo to step (to|too)\b/gi, 'go to step 2');
    normalized = normalized.replace(/\bgo to step for\b/gi, 'go to step 4');
    
    return normalized;
  };

  // Check if text is a pure navigation command
  const isPureNavCommand = (text: string): boolean => {
    const normalized = text.toLowerCase().trim();
    const navPatterns = [
      /^step \d+$/,
      /^go to step \d+$/,
      /^next step$/,
      /^previous step$/,
      /^play$/,
      /^play video$/,
      /^resume$/,
      /^resume video$/,
      /^pause$/,
      /^pause video$/,
      /^stop video$/,
    ];
    
    return navPatterns.some(pattern => pattern.test(normalized));
  };

  // Extract video ID from YouTube URL
  const getVideoId = (url?: string): string | null => {
    if (!url) return null;
    // Handle various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const videoId = getVideoId(recipe.youtubeUrl || recipe.source_ref);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!videoId) return;

    let player: any = null;
    let scriptLoaded = false;

    const initializePlayer = () => {
      // Wait for DOM element to be available using ref
      const playerElement = playerContainerRef.current;
      if (!playerElement) {
        // Retry after a short delay if element doesn't exist yet
        setTimeout(initializePlayer, 100);
        return;
      }

      // Check if player already exists in this container
      if (playerElement.querySelector('iframe')) {
        console.log('Player already initialized in container');
        return;
      }

      try {
        player = new (window as any).YT.Player(playerElement, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: any) => {
              console.log('YouTube player ready');
              setYoutubePlayer(event.target);
            },
            onError: (event: any) => {
              console.error('YouTube player error:', event.data);
            },
            onStateChange: (event: any) => {
              // Track playing state
              if (event.data === (window as any).YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === (window as any).YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              }
            },
          },
        });
      } catch (error) {
        console.error('Failed to initialize YouTube player:', error);
      }
    };

    // Check if YouTube API is already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      // API already loaded, initialize immediately
      initializePlayer();
    } else {
      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (existingScript) {
        // Script is loading, wait for it
        const checkAPI = setInterval(() => {
          if ((window as any).YT && (window as any).YT.Player) {
            clearInterval(checkAPI);
            initializePlayer();
          }
        }, 100);
        
        // Cleanup interval after 10 seconds
        setTimeout(() => clearInterval(checkAPI), 10000);
      } else {
        // Load the script
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }

        // Set up callback for when API is ready
        (window as any).onYouTubeIframeAPIReady = () => {
          console.log('YouTube API ready');
          scriptLoaded = true;
          initializePlayer();
        };
      }
    }

    return () => {
      // Cleanup: destroy player if it exists
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (error) {
          console.error('Error destroying YouTube player:', error);
        }
      }
      // Don't delete onYouTubeIframeAPIReady as it might be used by other components
    };
  }, [videoId]);

  const handlePreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < recipe.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleJumpToStep = (index: number) => {
    setCurrentStepIndex(index);
    const step = recipe.steps[index];
    if (youtubePlayer) {
      // If step has a timestamp, seek to it
      if (step.timestamp) {
        // Parse timestamp (format: "M:SS" or "MM:SS")
        const parts = step.timestamp.split(':');
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1] || '0');
        const totalSeconds = minutes * 60 + seconds;
        if (totalSeconds > 0) {
          try {
            youtubePlayer.seekTo(totalSeconds, true);
            // Play the video when jumping to a step
            if (youtubePlayer.playVideo) {
              youtubePlayer.playVideo();
              setIsPlaying(true);
            }
          } catch (error) {
            console.error('Error seeking video:', error);
          }
        }
      } else if (step.timestamp_sec && step.timestamp_sec > 0) {
        // Use timestamp_sec if available
        try {
          youtubePlayer.seekTo(step.timestamp_sec, true);
          if (youtubePlayer.playVideo) {
            youtubePlayer.playVideo();
            setIsPlaying(true);
          }
        } catch (error) {
          console.error('Error seeking video:', error);
        }
      }
    }
  };

  const toggleIngredient = (index: number) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const addTimer = (minutes: number, label?: string) => {
    const newTimer: Timer = {
      id: Date.now().toString(),
      label: label || `${minutes} min timer`,
      totalSeconds: minutes * 60,
      remainingSeconds: minutes * 60,
      isRunning: true,
    };
    setTimers([...timers, newTimer]);
  };

  const toggleTimer = (id: string) => {
    setTimers(timers.map(t => 
      t.id === id ? { ...t, isRunning: !t.isRunning } : t
    ));
  };

  const removeTimer = (id: string) => {
    setTimers(timers.filter(t => t.id !== id));
  };

  // Classify user message as navigation command or general question
  const classifyMessage = (message: string): 'NAVIGATION_COMMAND' | 'GENERAL_QUESTION' => {
    const normalized = message.toLowerCase().trim();
    
    // Navigation command patterns (exact matching)
    const navPatterns = [
      /^go to step \d+$/,
      /^step \d+$/,
      /^next step$/,
      /^previous step$/,
      /^play$/,
      /^play video$/,
      /^resume$/,
      /^resume video$/,
      /^pause$/,
      /^pause video$/,
      /^stop video$/,
    ];
    
    for (const pattern of navPatterns) {
      if (pattern.test(normalized)) {
        return 'NAVIGATION_COMMAND';
      }
    }
    
    return 'GENERAL_QUESTION';
  };

  // Parse navigation command and execute
  const handleNavigationCommand = (command: string) => {
    const normalized = command.toLowerCase().trim();
    
    if (normalized === 'next step') {
      if (currentStepIndex < recipe.steps.length - 1) {
        const nextIndex = currentStepIndex + 1;
        handleJumpToStep(nextIndex);
        setAiMessages(prev => [...prev, { type: 'assistant', text: `Jumped to step ${nextIndex + 1}` }]);
      } else {
        setAiMessages(prev => [...prev, { type: 'assistant', text: 'Already at the last step' }]);
      }
      return;
    }
    
    if (normalized === 'previous step') {
      if (currentStepIndex > 0) {
        const prevIndex = currentStepIndex - 1;
        handleJumpToStep(prevIndex);
        setAiMessages(prev => [...prev, { type: 'assistant', text: `Jumped to step ${prevIndex + 1}` }]);
      } else {
        setAiMessages(prev => [...prev, { type: 'assistant', text: 'Already at the first step' }]);
      }
      return;
    }
    
    // Extract step number from "go to step N" or "step N"
    const stepMatch = normalized.match(/step (\d+)/);
    if (stepMatch) {
      const stepNum = parseInt(stepMatch[1], 10);
      const stepIndex = stepNum - 1; // Convert to 0-based index
      
      if (stepIndex >= 0 && stepIndex < recipe.steps.length) {
        handleJumpToStep(stepIndex);
        setAiMessages(prev => [...prev, { type: 'assistant', text: `Jumped to step ${stepNum}` }]);
      } else {
        setAiMessages(prev => [...prev, { type: 'assistant', text: `Step ${stepNum} is out of range. This recipe has ${recipe.steps.length} steps.` }]);
      }
      return;
    }

    // Handle play/pause commands
    if (normalized === 'play' || normalized === 'play video' || normalized === 'resume' || normalized === 'resume video') {
      if (youtubePlayer && youtubePlayer.playVideo) {
        try {
          youtubePlayer.playVideo();
          console.debug('playVideo command: called playVideo()');
          // Check state after a short delay to verify success
          setTimeout(() => {
            try {
              const state = youtubePlayer.getPlayerState?.();
              console.debug('playVideo command: state after play:', state);
              if (state === 1) { // PLAYING
                setIsPlaying(true);
                setAiMessages(prev => [...prev, { type: 'assistant', text: 'Playing video' }]);
              } else {
                console.debug('playVideo command: failed to play, state:', state);
                setIsPlaying(false);
                setAiMessages(prev => [...prev, { type: 'assistant', text: 'Unable to start video. Tap play or say play again.' }]);
              }
            } catch (e) {
              console.error('Error checking play state:', e);
              setAiMessages(prev => [...prev, { type: 'assistant', text: 'Unable to start video. Tap play or say play again.' }]);
            }
          }, 300);
        } catch (error) {
          console.error('Error playing video:', error);
          setAiMessages(prev => [...prev, { type: 'assistant', text: 'Unable to start video. Tap play or say play again.' }]);
        }
      } else {
        setAiMessages(prev => [...prev, { type: 'assistant', text: 'No video available' }]);
      }
      return;
    }

    if (normalized === 'pause' || normalized === 'pause video' || normalized === 'stop video') {
      if (youtubePlayer && youtubePlayer.pauseVideo) {
        try {
          youtubePlayer.pauseVideo();
          const state = youtubePlayer.getPlayerState?.();
          if (state === 2) { // PAUSED
            setIsPlaying(false);
            setAiMessages(prev => [...prev, { type: 'assistant', text: 'Paused video' }]);
          } else {
            console.debug('pauseVideo command: failed to pause, state:', state);
            setIsPlaying(false);
            setAiMessages(prev => [...prev, { type: 'assistant', text: 'Paused video' }]);
          }
        } catch (error) {
          console.error('Error pausing video:', error);
          setAiMessages(prev => [...prev, { type: 'assistant', text: 'Unable to pause video' }]);
        }
      } else {
        setAiMessages(prev => [...prev, { type: 'assistant', text: 'No video available' }]);
      }
      return;
    }
  };

  // Video control helpers
  const pauseVideo = (): boolean => {
    if (youtubePlayer && youtubePlayer.pauseVideo) {
      try {
        youtubePlayer.pauseVideo();
        // Verify pause success
        const state = youtubePlayer.getPlayerState?.();
        if (state === 2) { // PAUSED
          setIsPlaying(false);
          console.debug('pauseVideo: success');
          return true;
        } else {
          console.debug('pauseVideo: failed to pause, state:', state);
          setIsPlaying(false); // Update state anyway
          return false;
        }
      } catch (error) {
        console.error('Error pausing video:', error);
        return false;
      }
    }
    return false;
  };

  const resumeVideo = (): boolean => {
    if (youtubePlayer && youtubePlayer.playVideo) {
      try {
        youtubePlayer.playVideo();
        // Verify play success with a short delay to allow state to update
        setTimeout(() => {
          const state = youtubePlayer.getPlayerState?.();
          if (state === 1) { // PLAYING
            setIsPlaying(true);
            console.debug('resumeVideo: success');
          } else {
            console.debug('resumeVideo: failed to play, state:', state);
            setIsPlaying(false);
          }
        }, 100);
        return true; // Optimistically return true
      } catch (error) {
        console.error('Error resuming video:', error);
        return false;
      }
    }
    return false;
  };

  const isVideoPlaying = (): boolean => {
    // Prefer getPlayerState() over isPlaying state
    if (youtubePlayer && youtubePlayer.getPlayerState) {
      try {
        const state = youtubePlayer.getPlayerState();
        return state === 1; // PLAYING
      } catch (error) {
        console.error('Error getting player state:', error);
        // Fall back to isPlaying state
        return isPlaying;
      }
    }
    // Fall back to isPlaying state if API unavailable
    return isPlaying;
  };

  const handleVoiceCommand = async (command: string) => {
    // Clear input after sending
    setChatInput('');
    
    setAiMessages(prev => [...prev, { type: 'user', text: command }]);
    
    const classification = classifyMessage(command);
    
    if (classification === 'NAVIGATION_COMMAND') {
      // Handle navigation locally (no AI call)
      handleNavigationCommand(command);
    } else {
      // General question - call AI
      try {
        const response = await aiAPI.chat(
          {
            id: recipe.id,
            title: recipe.title,
            description: recipe.description,
            ingredients: recipe.ingredients,
            steps: recipe.steps.map((step, idx) => ({
              text: step.text,
              index: step.index || idx + 1,
            })),
          },
          command,
          currentStepIndex
        );
        setAiMessages(prev => [...prev, { type: 'assistant', text: response }]);
      } catch (error) {
        console.error('AI chat error:', error);
        setAiMessages(prev => [...prev, { type: 'assistant', text: 'Sorry, I encountered an error. Please try again.' }]);
      }
    }
  };

  // Update sendCommandRef when handleVoiceCommand changes
  useEffect(() => {
    sendCommandRef.current = (text: string) => {
      handleVoiceCommand(text);
    };
  }, [handleVoiceCommand]);

  // Push-to-talk speech recognition hook
  const {
    supported: speechSupported,
    listening,
    error: speechError,
    startRecognition,
    stopRecognition,
    pauseRecognition,
    resumeRecognition,
  } = useHandsFreeSpeech({
    enabled: pttEnabled,
    silenceMs: 2500,
    autoSend: false, // Disable auto-send; we'll send on keyup
    onTextUpdate: (text) => {
      setChatInput(text);
      lastTranscriptRef.current = text; // Store latest transcript
    },
    onAutoSend: () => {
      // No-op since we handle sending on keyup
    },
    onStop: () => {
      // Called when recognition fully ends - send transcript if pending
      // This is triggered when spacebar is released, after recognition stops
      console.debug('onStop: called, pendingSend:', pendingSendRef.current);
      if (!pendingSendRef.current) {
        console.debug('onStop: pendingSend is false, returning');
        return;
      }
      pendingSendRef.current = false;
      
      // Capture transcript at the moment recognition ends
      // lastTranscriptRef.current contains the latest transcript (same as what's visible in the input box)
      // because onTextUpdate updates both chatInput state and lastTranscriptRef
      const raw = lastTranscriptRef.current.trim();
      console.debug('onStop: raw transcript:', raw);
      if (!raw) {
        console.debug('onStop: empty transcript, clearing and returning');
        lastTranscriptRef.current = '';
        setChatInput('');
        return;
      }
      
      // Basic cleanup
      const cleaned = basicCleanup(raw);
      console.debug('onStop: cleaned transcript:', cleaned);
      
      // Check for cancel keyword (anywhere in cleaned text)
      if (/\bcancel\b/i.test(cleaned)) {
        console.debug('onStop: cancel detected, clearing and returning');
        setChatInput('');
        lastTranscriptRef.current = '';
        return;
      }
      
      // Check if already a pure nav command
      if (isPureNavCommand(cleaned)) {
        console.debug('onStop: pure nav command detected, sending:', cleaned);
        setChatInput('');
        sendCommandRef.current(cleaned);
        lastTranscriptRef.current = '';
        return;
      }
      
      // Try normalizing step words
      const mapped = normalizeStepWordCommand(cleaned);
      
      // If mapped is now a pure nav command, send mapped; otherwise send original cleaned
      const toSend = isPureNavCommand(mapped) ? mapped : cleaned;
      console.debug('onStop: sending command:', toSend);
      
      setChatInput('');
      sendCommandRef.current(toSend);
      lastTranscriptRef.current = '';
    },
    onDisable: () => {
      setPttEnabled(false);
    },
    pauseVideo,
    resumeVideo,
    isVideoPlaying,
    enableTTS: true,
  });

  // TTS for assistant messages
  useEffect(() => {
    if (!pttEnabled || aiMessages.length === 0) return;

    const lastIndex = aiMessages.length - 1;
    const lastMessage = aiMessages[lastIndex];
    
    // Only speak new assistant messages (not the initial welcome message or previously spoken ones)
    if (lastMessage.type === 'assistant' && lastIndex > lastSpokenMessageIndexRef.current) {
      lastSpokenMessageIndexRef.current = lastIndex;
      
      // Skip the initial welcome message
      if (lastIndex === 0) return;

      // Note: In PTT mode, we don't pause recognition because recognition only runs when spacebar is held
      const utterance = new SpeechSynthesisUtterance(lastMessage.text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        // No resume needed in PTT mode
      };

      utterance.onerror = (error) => {
        console.error('TTS error:', error);
      };

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }, [aiMessages, pttEnabled]);

  // Spacebar key handlers for push-to-talk
  useEffect(() => {
    if (!pttEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      
      // Ignore key repeats
      if (e.repeat) return;

      // Ignore if target is an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore if already down (shouldn't happen with repeat check, but double-check)
      if (isSpaceDownRef.current) {
        console.debug('handleKeyDown: space already down, ignoring');
        return;
      }

      console.debug('handleKeyDown: space pressed');
      isSpaceDownRef.current = true;
      lastKeyDownTimeRef.current = Date.now();
      
      // Don't preventDefault on keydown - only prevent it on keyup
      // This prevents issues where preventDefault on keydown causes keyup to fire immediately
      e.stopPropagation();

      // Cancel any TTS currently speaking
      window.speechSynthesis.cancel();

      // Clear chat input and reset transcript
      setChatInput('');
      lastTranscriptRef.current = '';
      pendingSendRef.current = false;

      // Start recognition (user gesture)
      startRecognition();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;

      console.debug('handleKeyUp: space keyup event received', {
        isSpaceDown: isSpaceDownRef.current,
        timeSinceKeyDown: lastKeyDownTimeRef.current > 0 ? Date.now() - lastKeyDownTimeRef.current : 'never'
      });

      // Ignore if target is an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        console.debug('handleKeyUp: ignoring, target is input/textarea');
        return;
      }

      // Ignore keyup if it fires too quickly after keydown (< 100ms)
      // This handles cases where keyup fires immediately after keydown on some systems
      // Check this FIRST before checking isSpaceDownRef, because keyup might fire before keydown completes
      if (lastKeyDownTimeRef.current > 0) {
        const timeSinceKeyDown = Date.now() - lastKeyDownTimeRef.current;
        if (timeSinceKeyDown < 100) {
          console.debug(`handleKeyUp: keyup fired too quickly (${timeSinceKeyDown}ms), ignoring`);
          return;
        }
      }

      // Only handle keyup if space was actually down
      if (!isSpaceDownRef.current) {
        console.debug('handleKeyUp: space not down, ignoring');
        return;
      }

      console.debug('handleKeyUp: space released - stopping recognition');
      isSpaceDownRef.current = false;
      e.preventDefault();
      e.stopPropagation();

      // Set pending send BEFORE stopping recognition (to catch onStop callback)
      pendingSendRef.current = true;
      stopRecognition();
    };

    // Use capture phase to handle events early, before they can cause side effects
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      // Clean up: stop recognition and clear refs on unmount
      if (isSpaceDownRef.current || pendingSendRef.current) {
        isSpaceDownRef.current = false;
        pendingSendRef.current = false;
        stopRecognition();
      }
    };
  }, [pttEnabled]); // Don't include startRecognition/stopRecognition - they're stable useCallback refs

  // Timer countdown effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(timers => timers.map(timer => {
        if (timer.isRunning && timer.remainingSeconds > 0) {
          return { ...timer, remainingSeconds: timer.remainingSeconds - 1 };
        }
        return timer;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMultiplierChange = (value: string) => {
    setMultiplierInput(value);
  };

  const handleMultiplierBlur = () => {
    const numValue = parseFloat(multiplierInput);
    if (!isNaN(numValue) && numValue > 0) {
      setServingMultiplier(numValue);
      setMultiplierInput(numValue.toString());
    } else {
      // Reset to current multiplier if invalid
      setMultiplierInput(servingMultiplier.toString());
    }
    setIsEditingMultiplier(false);
  };

  const handleMultiplierKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleMultiplierBlur();
    } else if (e.key === 'Escape') {
      setMultiplierInput(servingMultiplier.toString());
      setIsEditingMultiplier(false);
    }
  };

  const handleMultiplierClick = () => {
    setIsEditingMultiplier(true);
    setMultiplierInput(servingMultiplier.toString());
  };

  const updateMultiplier = (newValue: number) => {
    const finalValue = Math.max(0.1, newValue);
    setServingMultiplier(finalValue);
    setMultiplierInput(finalValue.toString());
  };

  const handleAddCustomTimer = () => {
    const minutes = parseFloat(customTimerMinutes);
    if (!isNaN(minutes) && minutes > 0) {
      addTimer(minutes);
      setCustomTimerMinutes('');
      setShowCustomTimer(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-white">{recipe.title}</h2>
            <p className="text-sm text-gray-400">Cook Mode</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {pttEnabled && isSpaceDownRef.current && listening && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 border border-orange-500 rounded-lg">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              <span className="text-orange-400 text-sm">Listening...</span>
            </div>
          )}
          {speechError && (
            <div className="px-3 py-1.5 bg-red-500/20 border border-red-500 rounded-lg">
              <span className="text-red-400 text-sm">{speechError}</span>
            </div>
          )}
          <button
            onClick={() => {
              if (!speechSupported) return;
              setPttEnabled(!pttEnabled);
            }}
            disabled={!speechSupported}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              pttEnabled
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${!speechSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!speechSupported ? 'Voice not supported in this browser' : ''}
          >
            {pttEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            <span>Push to talk</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col lg:grid lg:grid-cols-[2fr_1fr] gap-4 p-2 md:p-4">
        {/* Left: Video and AI chat */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Video player */}
          <div className="bg-black rounded-xl overflow-hidden aspect-video flex-shrink-0">
            {videoId ? (
              <div 
                ref={playerContainerRef}
                key={`youtube-player-${videoId}`}
                className="w-full h-full"
                style={{ minHeight: '400px' }}
              ></div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={recipe.thumbnail || '/default_recipe.jpg'}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/default_recipe.jpg';
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="text-white">No video available</p>
                </div>
              </div>
            )}
          </div>

          {/* AI conversation */}
          <div className="bg-gray-800 rounded-xl flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white">AI Assistant</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {aiMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`px-4 py-2 rounded-lg max-w-[80%] ${
                      msg.type === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Chat input */}
            <div className="p-4 border-t border-gray-700">
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => {
                    setChatInput('go to step 3');
                    handleVoiceCommand('go to step 3');
                  }}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  Go to step 3
                </button>
                <button
                  onClick={() => {
                    setChatInput('next step');
                    handleVoiceCommand('next step');
                  }}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  Next step
                </button>
                <button
                  onClick={() => {
                    setChatInput('What can I substitute for yogurt?');
                    handleVoiceCommand('What can I substitute for yogurt?');
                  }}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  Substitution help
                </button>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                }}
                placeholder="Type a question or command (e.g., 'go to step 3', 'next step', 'What can I substitute for yogurt?')"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    handleVoiceCommand(chatInput.trim());
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Right: Steps, Ingredients, Timers */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Steps card */}
          <div className="bg-gray-800 rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white">Steps</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {/* Current step */}
              <div className="bg-orange-500 text-white p-4 rounded-lg mb-4">
                <div className="text-sm opacity-90 mb-1">Step {currentStepIndex + 1} of {recipe.steps.length}</div>
                <p>{currentStep.text}</p>
                {currentStep.timestamp && (
                  <div className="text-sm opacity-90 mt-2">@ {currentStep.timestamp}</div>
                )}
              </div>

              {/* Step navigation */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handlePreviousStep}
                  disabled={currentStepIndex === 0}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={currentStepIndex === recipe.steps.length - 1}
                  className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>

              {/* All steps */}
              <div className="space-y-2">
                {recipe.steps.map((step, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleJumpToStep(idx)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      idx === currentStepIndex
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500'
                        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-sm opacity-75">{idx + 1}.</span> {step.text}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ingredients card */}
          <div className="bg-gray-800 rounded-xl flex flex-col max-h-64">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white">Ingredients</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateMultiplier(servingMultiplier - 0.5)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-300"
                >
                  <Minus className="w-4 h-4" />
                </button>
                {isEditingMultiplier ? (
                  <input
                    type="number"
                    value={multiplierInput}
                    onChange={(e) => handleMultiplierChange(e.target.value)}
                    onBlur={handleMultiplierBlur}
                    onKeyDown={handleMultiplierKeyPress}
                    min="0.1"
                    step="any"
                    className="w-16 px-2 py-1 bg-gray-700 text-white text-sm rounded text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                    autoFocus
                  />
                ) : (
                  <span
                    onClick={handleMultiplierClick}
                    className="text-white text-sm min-w-[3rem] text-center cursor-pointer hover:text-orange-400 transition-colors px-2 py-1 rounded hover:bg-gray-700"
                    title="Click to edit"
                  >
                    {servingMultiplier}x
                  </span>
                )}
                <button
                  onClick={() => updateMultiplier(servingMultiplier + 0.5)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-300"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {recipe.ingredients.map((ingredient, idx) => {
                const isChecked = checkedIngredients.has(idx);
                // Scale qty only if it's a numeric string
                const n = Number(ingredient.qty);
                let displayQty: string;
                if (Number.isFinite(n) && !isNaN(n)) {
                  const scaled = n * servingMultiplier;
                  // Show up to 2 decimal places, removing trailing zeros
                  displayQty = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(2).replace(/\.?0+$/, '');
                } else {
                  // Display as-is for "To taste", "As required", etc.
                  displayQty = ingredient.qty;
                }
                
                // Build display line: [orange qty] + [unit + " " + item]
                const unitPart = ingredient.unit ? `${ingredient.unit} ` : '';
                const displayText = `${unitPart}${ingredient.item}`;

                return (
                  <button
                    key={idx}
                    onClick={() => toggleIngredient(idx)}
                    className="w-full flex items-start gap-3 text-left hover:bg-gray-700/50 p-2 rounded transition-colors"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className={isChecked ? 'line-through text-gray-500' : 'text-gray-200'}>
                      <span className="text-orange-300">{displayQty}</span> {displayText}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timers card */}
          <div className="bg-gray-800 rounded-xl flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white">Timers</h3>
            </div>
            
            <div className="p-4 space-y-3">
              {/* Timer presets */}
              <div className="flex gap-2">
                <button
                  onClick={() => addTimer(5)}
                  className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors text-sm"
                >
                  5 min
                </button>
                <button
                  onClick={() => addTimer(10)}
                  className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors text-sm"
                >
                  10 min
                </button>
              </div>

              {/* Custom timer */}
              {showCustomTimer ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customTimerMinutes}
                    onChange={(e) => setCustomTimerMinutes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddCustomTimer();
                      } else if (e.key === 'Escape') {
                        setShowCustomTimer(false);
                        setCustomTimerMinutes('');
                      }
                    }}
                    placeholder="Minutes"
                    min="0.1"
                    step="0.1"
                    className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleAddCustomTimer}
                    disabled={!customTimerMinutes || parseFloat(customTimerMinutes) <= 0}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowCustomTimer(false);
                      setCustomTimerMinutes('');
                    }}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors text-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomTimer(true)}
                  className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add custom timer
                </button>
              )}

              {/* Active timers */}
              {timers.map((timer) => {
                const progress = (timer.remainingSeconds / timer.totalSeconds) * 100;
                const isComplete = timer.remainingSeconds === 0;

                return (
                  <div
                    key={timer.id}
                    className={`p-3 rounded-lg ${
                      isComplete ? 'bg-green-500/20 border border-green-500' : 'bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-orange-400" />
                        <span className="text-white text-sm">{timer.label}</span>
                      </div>
                      <button
                        onClick={() => removeTimer(timer.id)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTimer(timer.id)}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm transition-colors"
                      >
                        {timer.isRunning ? 'Pause' : 'Resume'}
                      </button>
                      <div className="flex-1 text-right">
                        <span className={`${isComplete ? 'text-green-400' : 'text-white'}`}>
                          {isComplete ? 'Done!' : formatTime(timer.remainingSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
