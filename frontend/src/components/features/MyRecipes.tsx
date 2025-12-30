import React, { useState } from 'react';
import { Lock, Globe, MoreVertical, ChefHat, Edit, Trash2, BookOpen, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import type { Recipe, Cookbook } from '../../types';
import { CookbookSelectModal } from '../modals/CookbookSelectModal';
import { EditRecipeModal } from '../modals/EditRecipeModal';
import { getRecipeThumbnail } from '../../utils/images';

interface MyRecipesProps {
  recipes: Recipe[];
  cookbooks: Cookbook[];
  onViewRecipe: (recipe: Recipe) => void;
  onStartCook: (recipe: Recipe) => void;
  onDeleteRecipe: (id: string) => void;
  onUpdateRecipe?: (recipe: Recipe) => void;
  onMoveToCookbook?: (recipeId: string, cookbookId: string | null) => void;
  onTogglePrivacy?: (recipeId: string) => void;
  cookbookTitle?: string;
  onBack?: () => void;
}

export function MyRecipes({ 
  recipes, 
  cookbooks, 
  onViewRecipe, 
  onStartCook, 
  onDeleteRecipe,
  onUpdateRecipe,
  onMoveToCookbook,
  onTogglePrivacy,
  cookbookTitle, 
  onBack 
}: MyRecipesProps) {
  const [filter, setFilter] = useState<'all' | 'private' | 'public'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'cooked' | 'az'>('recent');
  const [selectedCookbook, setSelectedCookbook] = useState<string>('all');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showCookbookSelect, setShowCookbookSelect] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);

  const filteredRecipes = recipes
    .filter(r => {
      if (filter === 'private') return !r.isPublic;
      if (filter === 'public') return r.isPublic;
      return true;
    })
    .filter(r => {
      if (selectedCookbook === 'all') return true;
      return (r.cookbookIds || []).includes(selectedCookbook);
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime;
      }
      if (sortBy === 'cooked') {
        if (!a.cookedAt) return 1;
        if (!b.cookedAt) return -1;
        const aTime = a.cookedAt instanceof Date ? a.cookedAt.getTime() : new Date(a.cookedAt).getTime();
        const bTime = b.cookedAt instanceof Date ? b.cookedAt.getTime() : new Date(b.cookedAt).getTime();
        return bTime - aTime;
      }
      return a.title.localeCompare(b.title);
    });

  const handleMoveToCookbook = (recipeId: string, cookbookId: string | null) => {
    if (onMoveToCookbook) {
      onMoveToCookbook(recipeId, cookbookId);
    }
    setShowCookbookSelect(null);
  };

  const handleEdit = (recipe: Recipe) => {
    setShowEditModal(recipe.id);
    setMenuOpen(null);
  };

  const handleSaveEdit = (updatedRecipe: Recipe) => {
    if (onUpdateRecipe) {
      onUpdateRecipe(updatedRecipe);
    }
    setShowEditModal(null);
  };

  const handleTogglePrivacy = (recipeId: string) => {
    if (onTogglePrivacy) {
      onTogglePrivacy(recipeId);
    }
    setMenuOpen(null);
  };

  return (
    <div className="p-4 md:p-8">
      {/* Header with back button if viewing cookbook */}
      {cookbookTitle && onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ChevronLeft className="w-5 h-5" />
          Back to Cookbooks
        </button>
      )}

      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 flex-wrap">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm md:text-base"
        >
          <option value="all">All recipes</option>
          <option value="private">Private only</option>
          <option value="public">Public only</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm md:text-base"
        >
          <option value="recent">Recently added</option>
          <option value="cooked">Recently cooked</option>
          <option value="az">A–Z</option>
        </select>

        {!cookbookTitle && (
          <select
            value={selectedCookbook}
            onChange={(e) => setSelectedCookbook(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm md:text-base"
          >
            <option value="all">All cookbooks</option>
            {cookbooks.map(cb => (
              <option key={cb.id} value={cb.id}>{cb.title}</option>
            ))}
          </select>
        )}
      </div>

      {filteredRecipes.length === 0 ? (
        <div className="text-center py-16">
          <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-gray-600 mb-2">No recipes yet</h3>
          <p className="text-gray-500 text-sm">Start by creating your first recipe</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {filteredRecipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow group"
            >
              <div
                onClick={() => onViewRecipe(recipe)}
                className="cursor-pointer"
              >
                <div className="relative aspect-video">
                  <img
                    src={getRecipeThumbnail(recipe.thumbnail, recipe.youtubeUrl || recipe.source_ref)}
                    alt={recipe.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/default_recipe.jpg';
                    }}
                  />
                  <div className="absolute top-2 left-2 md:top-3 md:left-3">
                    {recipe.isPublic ? (
                      <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1">
                        <Globe className="w-3 h-3 text-blue-600" />
                        <span className="text-xs text-blue-600">Public</span>
                      </div>
                    ) : (
                      <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1">
                        <Lock className="w-3 h-3 text-gray-600" />
                        <span className="text-xs text-gray-600">Private</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="absolute top-2 right-2 md:top-3 md:right-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === recipe.id ? null : recipe.id);
                      }}
                      className="bg-white/90 backdrop-blur-sm p-2 rounded-md hover:bg-white transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-700" />
                    </button>
                    
                    {menuOpen === recipe.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(null);
                          }}
                        />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(recipe);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCookbookSelect(recipe.id);
                              setMenuOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                          >
                            <BookOpen className="w-4 h-4" />
                            Move to cookbook
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePrivacy(recipe.id);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                          >
                            {recipe.isPublic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            Make {recipe.isPublic ? 'private' : 'public'}
                          </button>
                          <div className="border-t border-gray-100 my-2"></div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(recipe.id);
                              setMenuOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center gap-2 text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="text-gray-900 mb-2 line-clamp-2 text-sm md:text-base">{recipe.title}</h3>
                  <div className="flex items-center gap-3 text-xs md:text-sm text-gray-500 mb-4">
                    <span>{recipe.duration}</span>
                    <span>•</span>
                    <span>{recipe.cuisine}</span>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartCook(recipe);
                  }}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
                >
                  <ChefHat className="w-4 h-4" />
                  Cook
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-gray-900 mb-2">Delete recipe?</h3>
            <p className="text-gray-600 text-sm mb-6">
              Are you sure you want to delete "{recipes.find(r => r.id === deleteConfirm)?.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteRecipe(deleteConfirm);
                  setDeleteConfirm(null);
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cookbook select modal */}
      {showCookbookSelect && (
        <CookbookSelectModal
          cookbooks={cookbooks}
          onSelect={(cookbookId) => handleMoveToCookbook(showCookbookSelect, cookbookId)}
          onClose={() => setShowCookbookSelect(null)}
          title="Move to cookbook"
          allowNew={false}
        />
      )}

      {/* Edit recipe modal */}
      {showEditModal && (
        <EditRecipeModal
          recipe={recipes.find(r => r.id === showEditModal)!}
          onSave={handleSaveEdit}
          onClose={() => setShowEditModal(null)}
        />
      )}
    </div>
  );
}
