import React, { useState, useEffect } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Mic, MicOff, ChevronUp, ChevronDown, Plus, Minus, Clock, CheckSquare, Square } from 'lucide-react';
import type { Recipe } from '../../types';

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
  const [voiceEnabled, setVoiceEnabled] = useState(false);
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

  const currentStep = recipe.steps[currentStepIndex];

  // Extract video ID from YouTube URL
  const getVideoId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const videoId = getVideoId(recipe.youtubeUrl || recipe.source_ref);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!videoId) return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    (window as any).onYouTubeIframeAPIReady = () => {
      const player = new (window as any).YT.Player('youtube-player', {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            setYoutubePlayer(player);
          },
        },
      });
    };

    return () => {
      if ((window as any).onYouTubeIframeAPIReady) {
        delete (window as any).onYouTubeIframeAPIReady;
      }
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
    if (step.timestamp && youtubePlayer) {
      // Parse timestamp (format: "M:SS" or "MM:SS")
      const parts = step.timestamp.split(':');
      const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
      if (seconds > 0) {
        youtubePlayer.seekTo(seconds, true);
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

  const handleVoiceCommand = (command: string) => {
    setAiMessages([...aiMessages, { type: 'user', text: command }]);
    
    // Simulate AI response
    setTimeout(() => {
      let response = '';
      if (command.includes('scale to 500g')) {
        response = 'Scaled recipe to 500g chicken. All ingredient quantities have been updated.';
      } else if (command.includes('too much salt')) {
        response = 'If you added too much salt, try adding a peeled potato to absorb some of the salt, or balance it with a bit of sugar or acid like lemon juice.';
      } else if (command.includes('add tomato')) {
        const stepIndex = recipe.steps.findIndex(s => s.text.toLowerCase().includes('tomato'));
        if (stepIndex >= 0) {
          setCurrentStepIndex(stepIndex);
          response = `Jumped to step ${stepIndex + 1}: ${recipe.steps[stepIndex].text}`;
        }
      } else {
        response = 'I can help you navigate steps, scale ingredients, or answer cooking questions.';
      }
      setAiMessages(prev => [...prev, { type: 'assistant', text: response }]);
    }, 500);
  };

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
        
        <button
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            voiceEnabled
              ? 'bg-orange-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {voiceEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          <span>Hands-free</span>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col lg:grid lg:grid-cols-[2fr_1fr] gap-4 p-2 md:p-4">
        {/* Left: Video and AI chat */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Video player */}
          <div className="bg-black rounded-xl overflow-hidden aspect-video flex-shrink-0">
            {videoId ? (
              <div id="youtube-player" className="w-full h-full"></div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={recipe.thumbnail}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
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

            {/* Voice command suggestions */}
            <div className="p-4 border-t border-gray-700">
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => handleVoiceCommand("Go to 'add tomato'")}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  Go to 'add tomato'
                </button>
                <button
                  onClick={() => handleVoiceCommand('What if I added too much salt?')}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  Too much salt?
                </button>
                <button
                  onClick={() => handleVoiceCommand('Scale to 500g')}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  Scale to 500g
                </button>
              </div>
              <input
                type="text"
                placeholder="Type a question or command..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value) {
                    handleVoiceCommand(e.currentTarget.value);
                    e.currentTarget.value = '';
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
                const scaledAmount = ingredient.amount.replace(/\d+(\.\d+)?/g, (match) => {
                  const num = parseFloat(match) * servingMultiplier;
                  // Show up to 2 decimal places, removing trailing zeros
                  const formatted = num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
                  return formatted;
                });

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
                      <span className="text-orange-300">{scaledAmount}</span> {ingredient.name}
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
