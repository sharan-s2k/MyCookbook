import { useState, useEffect } from 'react';
import { X, CheckCircle, Loader } from 'lucide-react';
import type { Recipe } from '../../types';
import { recipeAPI } from '../../api/client';
import { useAppContext } from '../../App';

interface EditRecipeModalProps {
  recipe: Recipe;
  onSave: (recipe: Recipe) => void;
  onClose: () => void;
}

export function EditRecipeModal({ recipe, onSave, onClose }: EditRecipeModalProps) {
  const { updateRecipeInStore } = useAppContext();
  
  // Normalize ingredients to always be object format for editing
  const normalizeIngredients = (ings: Recipe['ingredients']): Array<{ name: string; amount: string }> => {
    if (!Array.isArray(ings)) return [];
    return ings.map(ing => {
      if (typeof ing === 'string') {
        const parts = ing.split(/\s+(.+)/);
        return {
          name: parts[1] || ing,
          amount: parts[0] || '',
        };
      }
      return ing;
    });
  };

  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description);
  const [duration, setDuration] = useState(recipe.duration);
  const [cuisine, setCuisine] = useState(recipe.cuisine);
  const [isPublic, setIsPublic] = useState(recipe.isPublic);
  const [ingredients, setIngredients] = useState<Array<{ name: string; amount: string }>>(normalizeIngredients(recipe.ingredients));
  const [steps, setSteps] = useState(recipe.steps);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(recipe.title);
    setDescription(recipe.description);
    setDuration(recipe.duration);
    setCuisine(recipe.cuisine);
    setIsPublic(recipe.isPublic);
    setIngredients(normalizeIngredients(recipe.ingredients));
    setSteps(recipe.steps);
  }, [recipe]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Transform frontend format to backend format
      const backendIngredients = (Array.isArray(ingredients) ? ingredients : []).map((ing: any) => {
        if (typeof ing === 'string') {
          return ing;
        }
        const amount = ing.amount || '';
        const name = ing.name || '';
        return amount ? `${amount} ${name}`.trim() : name;
      });

      const backendSteps = (Array.isArray(steps) ? steps : []).map((step: any, idx: number) => {
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
        is_public: boolean;
        ingredients: string[];
        steps: any[];
      } = {
        title: title.trim(),
        is_public: isPublic,
        ingredients: backendIngredients,
        steps: backendSteps,
      };
      
      // Always send description since user can edit it in the form
      // If empty, send null to clear it in backend
      updatePayload.description = description.trim() || null;

      const updatedData = await recipeAPI.updateRecipe(recipe.id, updatePayload);

      // Transform backend response to frontend format (only backend fields)
      // Store-only fields (cookbookIds, author, etc.) will be preserved by updateRecipeInStore merge
      const backendFields: Partial<Recipe> & { id: string } = {
        id: updatedData.id,
        title: updatedData.title,
        description: updatedData.description || '',
        isPublic: updatedData.is_public,
        source_type: updatedData.source_type,
        source_ref: updatedData.source_ref,
        youtubeUrl: updatedData.source_type === 'youtube' ? updatedData.source_ref : undefined,
        ingredients: Array.isArray(updatedData.ingredients)
          ? updatedData.ingredients.map((ing: string) => {
              const parts = ing.split(/\s+(.+)/);
              return {
                name: parts[1] || ing,
                amount: parts[0] || '',
              };
            })
          : [],
        steps: updatedData.steps.map((step: any) => ({
          text: step.text,
          timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
          timestamp_sec: step.timestamp_sec,
          index: step.index,
        })),
        createdAt: new Date(updatedData.created_at),
      };

      // Update global store with backend fields (merge preserves store-only fields)
      updateRecipeInStore(backendFields);

      // Create updated recipe for local state and callback
      // This preserves store-only fields like cookbookIds, author, etc.
      const updatedRecipe: Recipe = {
        ...recipe,
        ...backendFields,
        // Ensure dates are Date objects
        createdAt: backendFields.createdAt || recipe.createdAt,
      };

      onSave(updatedRecipe);
      onClose();
    } catch (error: any) {
      console.error('Failed to update recipe:', error);
      setError(error.message || 'Failed to save recipe. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '' }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addStep = () => {
    setSteps([...steps, { text: '' }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-gray-900">Edit Recipe</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <div className="max-w-3xl mx-auto space-y-6">
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
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-gray-700">Ingredients</label>
                <button
                  onClick={addIngredient}
                  className="text-sm text-orange-500 hover:text-orange-600"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-2">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={ing.amount}
                      onChange={(e) => {
                        const newIng = [...ingredients];
                        newIng[idx].amount = e.target.value;
                        setIngredients(newIng);
                      }}
                      placeholder="Amount"
                      className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => {
                        const newIng = [...ingredients];
                        newIng[idx].name = e.target.value;
                        setIngredients(newIng);
                      }}
                      placeholder="Ingredient"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      onClick={() => removeIngredient(idx)}
                      className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-gray-700">Steps</label>
                <button
                  onClick={addStep}
                  className="text-sm text-orange-500 hover:text-orange-600"
                >
                  + Add
                </button>
              </div>
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
                    <button
                      onClick={() => removeStep(idx)}
                      className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors self-start mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
              />
              <label htmlFor="isPublic" className="text-sm text-gray-700">
                Make this recipe public
              </label>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

