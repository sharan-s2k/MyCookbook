import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Upload, Camera, Loader, CheckCircle } from 'lucide-react';
import type { Recipe } from '../../types';
import { useAppContext } from '../../App';

interface CreateModalProps {
  onClose: () => void;
  onSave?: (recipe: Recipe) => void;
  onRecipeCreated?: (recipeId: string) => void;
}

type CreateTab = 'youtube' | 'photo';
type CreateStep = 'input' | 'generating' | 'editing';

interface YouTubePreview {
  title: string;
  author: string;
  thumbnail: string;
  duration?: string;
}

export function CreateModal({ onClose, onSave, onRecipeCreated }: CreateModalProps) {
  const navigate = useNavigate();
  const { updateRecipeInStore } = useAppContext();
  const [activeTab, setActiveTab] = useState<CreateTab>('youtube');
  const [step, setStep] = useState<CreateStep>('input');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubePreview, setYoutubePreview] = useState<YouTubePreview | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [generatingProgress, setGeneratingProgress] = useState('');
  const [currentRecipeId, setCurrentRecipeId] = useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const pollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const errorTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Editing fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [ingredients, setIngredients] = useState<Array<{ qty: string; unit: string; item: string }>>([]);
  const [steps, setSteps] = useState<Array<{ text: string; timestamp_sec?: number; index?: number }>>([]);

  // Extract video ID from YouTube URL
  const extractVideoId = (url: string): string | null => {
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

  // Fetch YouTube video metadata
  const fetchYouTubeMetadata = async (url: string) => {
    try {
      // Use YouTube oEmbed API (no API key required)
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(oembedUrl);
      
      if (!response.ok) {
        throw new Error('Failed to fetch video metadata');
      }
      
      const data = await response.json();
      const videoId = extractVideoId(url);
      
      return {
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ''),
        duration: undefined, // oEmbed doesn't provide duration
      };
    } catch (error) {
      console.error('Failed to fetch YouTube metadata:', error);
      // Fallback: use video ID to generate thumbnail
      const videoId = extractVideoId(url);
      if (videoId) {
        return {
          title: 'Video',
          author: 'Unknown',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          duration: undefined,
        };
      }
      return null;
    }
  };

  // Fetch preview when URL changes
  React.useEffect(() => {
    if (youtubeUrl && step === 'input') {
      const videoId = extractVideoId(youtubeUrl);
      if (videoId) {
        fetchYouTubeMetadata(youtubeUrl).then(setYoutubePreview).catch(() => {
          // Fallback thumbnail
          setYoutubePreview({
            title: 'Video',
            author: 'Unknown',
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          });
        });
      } else {
        setYoutubePreview(null);
      }
    } else {
      setYoutubePreview(null);
    }
  }, [youtubeUrl, step]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (activeTab !== 'youtube' || !youtubeUrl) return;

    // Cancel any existing polling
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    abortControllerRef.current = new AbortController();

    setStep('generating');
    setGeneratingProgress('Creating import job...');

    try {
      const { recipeAPI } = await import('../../api/client');
      const { job_id } = await recipeAPI.createYoutubeImport(youtubeUrl);

      // Poll for job completion with ETag, Retry-After, exponential backoff, and jitter
      const maxAttempts = 120; // 4 minutes max (with exponential backoff)
      let attempts = 0;
      let currentEtag: string | undefined = undefined;
      let baseDelay = 1000; // Start with 1 second
      let pollInFlight = false; // Prevent overlapping poll requests

      const pollJob = async (): Promise<void> => {
        // Prevent overlapping requests
        if (pollInFlight) {
          return;
        }
        pollInFlight = true;
        try {
          // Check if aborted
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }

          attempts++;
          if (attempts > maxAttempts) {
            throw new Error('Import timed out');
          }

          const jobResult = await recipeAPI.getImportJob(job_id, currentEtag);
          
          // Check if aborted after async call
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }

        // Handle 304 Not Modified (no change)
        if ((jobResult as any).unchanged) {
          // Update ETag even on 304 (preserve for next request)
          if ((jobResult as any)._etag) {
            currentEtag = (jobResult as any)._etag;
          }
          
          // No change, use Retry-After or continue with current delay
          const retryAfter = (jobResult as any)._retryAfter;
          const delay = retryAfter ? retryAfter * 1000 : baseDelay;
          // Cap delay at 5s unless server says otherwise
          const cappedDelay = retryAfter ? Math.min(10000, delay) : Math.min(5000, delay);
          // Add jitter (±15%)
          const jitter = cappedDelay * 0.15 * (Math.random() * 2 - 1);
          const nextDelay = Math.max(500, cappedDelay + jitter);
          
          pollTimeoutRef.current = setTimeout(() => {
            pollTimeoutRef.current = null;
            if (!abortControllerRef.current?.signal.aborted) {
              pollJob();
            }
          }, nextDelay);
          return;
        }

        // Update ETag for next request
        if ((jobResult as any)._etag) {
          currentEtag = (jobResult as any)._etag;
        }

        const job = jobResult as any;
        setGeneratingProgress(`Processing... (${job.status})`);

        // Terminal states
        if (job.status === 'READY' && job.recipe_id) {
          const recipeId = job.recipe_id;
          console.log('Import job completed successfully, recipe_id:', recipeId);
          
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }
          
          // Fetch the recipe data to show in review screen
          try {
            const { recipeAPI } = await import('../../api/client');
            const recipeData = await recipeAPI.getRecipe(recipeId);
            
            // Transform backend format to frontend format
            const transformed: Recipe = {
              id: recipeData.id,
              title: recipeData.title,
              description: recipeData.description || '',
              isPublic: recipeData.is_public,
              source_type: recipeData.source_type,
              source_ref: recipeData.source_ref,
              youtubeUrl: recipeData.source_type === 'youtube' ? recipeData.source_ref : undefined,
              ingredients: Array.isArray(recipeData.ingredients)
                ? recipeData.ingredients.map((ing: any) => ({
                    qty: String(ing.qty),
                    unit: String(ing.unit),
                    item: String(ing.item),
                  }))
                : [],
              steps: recipeData.steps.map((step: any) => ({
                text: step.text,
                timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
                timestamp_sec: step.timestamp_sec,
                index: step.index,
              })),
              createdAt: new Date(recipeData.created_at),
            };
            
            // Populate editing fields with recipe data
            setTitle(transformed.title);
            setDescription(transformed.description);
            setIngredients(transformed.ingredients);
            setSteps(transformed.steps.map(s => ({ 
              text: s.text,
              timestamp_sec: s.timestamp_sec,
              index: s.index
            })));
            setCurrentRecipeId(recipeId);
            
            // Switch to editing/review step
            setStep('editing');
            setGeneratingProgress('');
          } catch (error) {
            console.error('Failed to fetch recipe for review:', error);
            // Fallback: navigate directly if fetch fails
            if (onRecipeCreated) {
              onRecipeCreated(recipeId);
            } else {
              navigate(`/recipes/${recipeId}`);
            }
            onClose();
          }
          return;
        } else if (job.status === 'FAILED') {
          // Provide more user-friendly error messages
          let errorMessage = job.error_message || 'Import failed';
          if (errorMessage.includes('Transcript unavailable') || errorMessage.includes('Transcript too short')) {
            errorMessage = 'This video does not have captions/transcripts available. Please try a different video with captions enabled.';
          } else if (errorMessage.includes('Invalid YouTube URL')) {
            errorMessage = 'Invalid YouTube URL. Please check the link and try again.';
          }
          throw new Error(errorMessage);
        }

        // Continue polling with Retry-After or exponential backoff
        let delay: number;
        if (job._retryAfter) {
          // Use server-suggested Retry-After (cap at 10s for safety)
          delay = Math.min(10000, job._retryAfter * 1000);
        } else {
          // Exponential backoff: 1s -> 1.5s -> 2.25s -> 3.4s -> 5s (cap at 5s)
          delay = Math.min(5000, baseDelay * Math.pow(1.5, attempts - 1));
          baseDelay = delay; // Update base for next iteration
        }
        
        // Add jitter (±15%)
        const jitter = delay * 0.15 * (Math.random() * 2 - 1);
        const nextDelay = Math.max(500, delay + jitter);
        
        pollTimeoutRef.current = setTimeout(() => {
          pollTimeoutRef.current = null;
          if (!abortControllerRef.current?.signal.aborted) {
            pollJob();
          }
        }, nextDelay);
        } finally {
          // Always reset pollInFlight, even on errors
          pollInFlight = false;
        }
      };

      await pollJob();
    } catch (error: any) {
      if (error.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        // User closed modal, silently stop
        return;
      }
      setGeneratingProgress(`Error: ${error.message}`);
      errorTimeoutRef.current = setTimeout(() => {
        errorTimeoutRef.current = null;
        if (!abortControllerRef.current?.signal.aborted) {
          setStep('input');
          setGeneratingProgress('');
        }
      }, 3000);
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!currentRecipeId) {
      console.error('No recipe ID available for update');
      return;
    }

    try {
      const { recipeAPI } = await import('../../api/client');
      
      // Transform frontend format to backend format - send as {qty, unit, item} objects
      const backendIngredients = ingredients.map((ing) => {
        return {
          qty: String(ing.qty || 'As required'),
          unit: String(ing.unit || ''),
          item: String(ing.item || ''),
        };
      });

      const backendSteps = steps.map((step, idx) => {
        // Preserve timestamp_sec and index from original if available
        return {
          index: step.index !== undefined ? step.index : idx + 1,
          text: step.text || '',
          timestamp_sec: step.timestamp_sec || 0,
        };
      });

      // Call update API
      // Send description as null if empty string (user cleared it), undefined if not provided
      const updatePayload: {
        title: string;
        description?: string | null;
        ingredients: Array<{ qty: string; unit: string; item: string }>;
        steps: any[];
      } = {
        title: title.trim(),
        ingredients: backendIngredients,
        steps: backendSteps,
      };
      
      // If description field was touched (user edited it), send it (even if empty)
      // If description is empty string, send null to clear it in backend
      if (description !== undefined) {
        updatePayload.description = description.trim() || null;
      }

      const updatedData = await recipeAPI.updateRecipe(currentRecipeId, updatePayload);

      // Transform backend response to frontend format
      const formatTimestamp = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };

      // Transform backend data to frontend format (only fields from backend)
      const backendFields: Partial<Recipe> = {
        id: updatedData.id,
        title: updatedData.title,
        description: updatedData.description || '',
        isPublic: updatedData.is_public,
        source_type: updatedData.source_type,
        source_ref: updatedData.source_ref,
        youtubeUrl: updatedData.source_type === 'youtube' ? updatedData.source_ref : undefined,
        ingredients: Array.isArray(updatedData.ingredients)
          ? updatedData.ingredients.map((ing: any) => ({
              qty: String(ing.qty),
              unit: String(ing.unit),
              item: String(ing.item),
            }))
          : [],
        steps: updatedData.steps.map((step: any) => ({
          text: step.text,
          timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
          timestamp_sec: step.timestamp_sec,
          index: step.index,
        })),
        createdAt: new Date(updatedData.created_at),
      };

      // Update global store - merge with existing recipe if it exists
      // If recipe doesn't exist in store yet, it will be added on next fetch
      // For now, we ensure id is present for the update
      if (backendFields.id) {
        updateRecipeInStore(backendFields as Partial<Recipe> & { id: string });
      }

      // Only navigate after successful update
      if (onRecipeCreated) {
        onRecipeCreated(currentRecipeId);
      } else {
        navigate(`/recipes/${currentRecipeId}`);
      }
      onClose();
    } catch (error: any) {
      console.error('Failed to update recipe:', error);
      // Show error message to user
      setGeneratingProgress(`Error: ${error.message || 'Failed to save recipe. Please try again.'}`);
      // Don't close modal or navigate on error
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-gray-900">Create Recipe</h2>
          <button
            onClick={() => {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
              }
              onClose();
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {step === 'input' && (
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('youtube')}
              className={`flex-1 px-6 py-4 transition-colors ${
                activeTab === 'youtube'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              From YouTube
            </button>
            <button
              onClick={() => setActiveTab('photo')}
              className={`flex-1 px-6 py-4 transition-colors ${
                activeTab === 'photo'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              From Photo
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'input' && (
            <>
              {activeTab === 'youtube' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      YouTube URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {youtubeUrl && youtubePreview && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h3 className="text-gray-900 text-sm mb-2">Preview</h3>
                      <div className="flex gap-3">
                        <img
                          src={youtubePreview.thumbnail}
                          alt={youtubePreview.title}
                          className="w-32 h-20 object-cover rounded flex-shrink-0"
                          onError={(e) => {
                            // Fallback to default thumbnail if image fails to load
                            const target = e.target as HTMLImageElement;
                            const videoId = extractVideoId(youtubeUrl);
                            if (videoId) {
                              target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-gray-900 mb-1 font-medium truncate">{youtubePreview.title}</div>
                          <div className="text-sm text-gray-600 truncate">
                            {youtubePreview.author}
                            {youtubePreview.duration && ` • ${youtubePreview.duration}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={!youtubeUrl}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    Generate recipe
                  </button>
                </div>
              )}

              {activeTab === 'photo' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Upload recipe photo
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-orange-500 transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        {uploadedImage ? (
                          <div className="space-y-3">
                            <img
                              src={uploadedImage}
                              alt="Uploaded"
                              className="max-h-64 mx-auto rounded-lg"
                            />
                            <p className="text-sm text-gray-600">Click to change image</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-700 mb-2">Drop your image here or click to browse</p>
                            <p className="text-sm text-gray-500">Supports JPG, PNG, HEIC</p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <button
                    className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    Use camera
                  </button>

                  <button
                    onClick={handleGenerate}
                    disabled={!uploadedImage}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    Extract recipe
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'generating' && (
            <div className="max-w-md mx-auto text-center py-16">
              <Loader className="w-16 h-16 text-orange-500 mx-auto mb-6 animate-spin" />
              <h3 className="text-gray-900 mb-2">{generatingProgress}</h3>
              <p className="text-gray-600 text-sm">This may take a few moments...</p>
            </div>
          )}

          {step === 'editing' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Review your recipe:</strong> Make any changes you'd like before saving. The recipe has been generated from the video and is ready to use.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Duration</label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Cuisine</label>
                <input
                  type="text"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Ingredients</label>
                <div className="space-y-2">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={ing.qty}
                        onChange={(e) => {
                          const newIng = [...ingredients];
                          newIng[idx].qty = e.target.value;
                          setIngredients(newIng);
                        }}
                        placeholder="Qty"
                        className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="text"
                        value={ing.unit}
                        onChange={(e) => {
                          const newIng = [...ingredients];
                          newIng[idx].unit = e.target.value;
                          setIngredients(newIng);
                        }}
                        placeholder="Unit"
                        className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="text"
                        value={ing.item}
                        onChange={(e) => {
                          const newIng = [...ingredients];
                          newIng[idx].item = e.target.value;
                          setIngredients(newIng);
                        }}
                        placeholder="Ingredient"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Steps</label>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        {idx + 1}
                      </div>
                      <textarea
                        value={step.text}
                        onChange={(e) => {
                          const newSteps = [...steps];
                          newSteps[idx].text = e.target.value;
                          setSteps(newSteps);
                        }}
                        rows={2}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'editing' && (
          <div className="p-4 md:p-6 border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 md:px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm md:text-base"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex-1 sm:flex-none px-4 md:px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
                Save recipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
