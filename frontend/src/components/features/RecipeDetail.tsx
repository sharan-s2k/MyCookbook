import React, { useState } from 'react';
import { ChefHat, Edit, BookOpen, Play, ChevronLeft } from 'lucide-react';
import type { Recipe } from '../../types';
import { CookbookSelectModal } from '../modals/CookbookSelectModal';
import { EditRecipeModal } from '../modals/EditRecipeModal';
import { getRecipeThumbnail, getYouTubeThumbnailUrl } from '../../utils/images';

interface RecipeDetailProps {
  recipe: Recipe;
  onStartCookMode: () => void;
  onBack: () => void;
  onUpdateRecipe?: (recipe: Recipe) => void;
  onSaveToCookbook?: (recipeId: string, cookbookIds: string[]) => void;
  cookbooks?: Array<{ id: string; title: string; recipeCount: number; previewImages: string[] }>;
}

export function RecipeDetail({ 
  recipe, 
  onStartCookMode, 
  onBack,
  onUpdateRecipe,
  onSaveToCookbook,
  cookbooks = []
}: RecipeDetailProps) {
  const [showCookbookSelect, setShowCookbookSelect] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const keyMoments = recipe.steps
    .filter(s => s.timestamp)
    .slice(0, 3)
    .map(s => ({ text: s.text, timestamp: s.timestamp }));

  const handleSaveToCookbook = (cookbookIds: string[]) => {
    if (onSaveToCookbook) {
      onSaveToCookbook(recipe.id, cookbookIds);
    }
    setShowCookbookSelect(false);
  };

  const handleSaveEdit = (updatedRecipe: Recipe) => {
    if (onUpdateRecipe) {
      onUpdateRecipe(updatedRecipe);
    }
    setShowEditModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-6 md:gap-8">
            <div>
              {/* Video thumbnail */}
              {recipe.youtubeUrl && (
                <div 
                  onClick={onStartCookMode}
                  className="aspect-video bg-gray-900 rounded-xl overflow-hidden mb-4 relative group cursor-pointer"
                >
                  <img
                    src={getRecipeThumbnail(recipe.thumbnail, recipe.youtubeUrl)}
                    alt={recipe.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to default if image fails to load
                      const target = e.target as HTMLImageElement;
                      target.src = '/default_recipe.jpg';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/90 rounded-full flex items-center justify-center">
                      <Play className="w-6 h-6 md:w-8 md:h-8 text-gray-900 ml-1" />
                    </div>
                  </div>
                </div>
              )}

              <h1 className="text-gray-900 mb-3 text-xl md:text-2xl lg:text-3xl">{recipe.title}</h1>
              <p className="text-gray-600 mb-4 text-sm md:text-base">{recipe.description}</p>
              
              <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs md:text-sm text-gray-500">
                {recipe.duration && <><span>{recipe.duration}</span><span>•</span></>}
                {recipe.cuisine && <><span>{recipe.cuisine}</span></>}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={onStartCookMode}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 md:px-6 py-3 md:py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <ChefHat className="w-5 h-5" />
                Start Cook Mode
              </button>
              
              <div className="flex gap-2 md:gap-3">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 md:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => setShowCookbookSelect(true)}
                  className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 md:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Save to cookbook</span>
                  <span className="sm:hidden">Save</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
        <div className="grid lg:grid-cols-2 gap-6 md:gap-8">
          {/* Ingredients */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <h2 className="text-gray-900 mb-4 text-lg md:text-xl">Ingredients</h2>
            <div className="space-y-3">
              {recipe.ingredients.map((ingredient, idx) => {
                // Build display line: [orange qty] + [unit + " " + item]
                const unitPart = ingredient.unit ? `${ingredient.unit} ` : '';
                const displayText = `${unitPart}${ingredient.item}`;
                return (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-orange-500 text-sm md:text-base font-medium">{ingredient.qty}</span>
                      <span className="text-gray-600 ml-2 text-sm md:text-base">{displayText}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Steps */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <h2 className="text-gray-900 mb-4 text-lg md:text-xl">Steps</h2>
            <div className="space-y-4">
              {recipe.steps.map((step, idx) => (
                <div key={idx} className="flex gap-3 md:gap-4">
                  <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center flex-shrink-0 text-sm md:text-base">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-700 text-sm md:text-base">{step.text}</p>
                    {step.timestamp && (
                      <button className="text-xs md:text-sm text-orange-500 hover:text-orange-600 mt-1">
                        Jump to {step.timestamp}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Key moments */}
        {keyMoments.length > 0 && (
          <div className="mt-6 md:mt-8 bg-white rounded-xl border border-gray-200 p-4 md:p-6">
            <h3 className="text-gray-900 mb-4 text-base md:text-lg">Jump to moment</h3>
            <div className="flex flex-wrap gap-2">
              {keyMoments.map((moment, idx) => (
                <button
                  key={idx}
                  className="px-3 md:px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors flex items-center gap-2 text-xs md:text-sm"
                >
                  <Play className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="truncate max-w-[200px]">{moment.text}</span>
                  <span className="text-gray-500">({moment.timestamp})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cookbook select modal */}
      {showCookbookSelect && (
        <CookbookSelectModal
          cookbooks={cookbooks}
          selectedCookbookIds={recipe.cookbookIds || []}
          onSelect={handleSaveToCookbook}
          onClose={() => setShowCookbookSelect(false)}
          title="Save to cookbook"
          allowNew={true}
        />
      )}

      {/* Edit recipe modal */}
      {showEditModal && (
        <EditRecipeModal
          recipe={recipe}
          onSave={handleSaveEdit}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
