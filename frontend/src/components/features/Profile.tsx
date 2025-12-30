import React, { useState } from 'react';
import { Edit, Lock, Globe, ChefHat } from 'lucide-react';
import type { User, Recipe } from '../../types';
import { getRecipeThumbnail } from '../../utils/images';

interface ProfileProps {
  user: User;
  recipes: Recipe[];
  onViewRecipe: (recipe: Recipe) => void;
  onStartCook: (recipe: Recipe) => void;
}

export function Profile({ user, recipes, onViewRecipe, onStartCook }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');

  const publicRecipes = recipes.filter(r => r.isPublic);
  const privateRecipes = recipes.filter(r => !r.isPublic);

  const displayRecipes = activeTab === 'public' ? publicRecipes : privateRecipes;

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Profile header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-6">
            <img
              src={user.avatar || '/default_profile.png'}
              alt={user.name}
              className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/default_profile.png';
              }}
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-gray-900">{user.name}</h1>
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Edit className="w-4 h-4" />
                  Edit profile
                </button>
              </div>
              <p className="text-gray-600 mb-4">{user.bio}</p>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-gray-900">{user.followers}</span>
                  <span className="text-gray-500 ml-1">Followers</span>
                </div>
                <div>
                  <span className="text-gray-900">{user.following}</span>
                  <span className="text-gray-500 ml-1">Following</span>
                </div>
                <div>
                  <span className="text-gray-900">{user.publicRecipes}</span>
                  <span className="text-gray-500 ml-1">Public recipes</span>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="text-gray-600">Default privacy:</span>
                <div className="flex items-center gap-1 text-gray-700">
                  <Lock className="w-4 h-4" />
                  <span>Private</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('public')}
            className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'public'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            Public ({publicRecipes.length})
          </button>
          <button
            onClick={() => setActiveTab('private')}
            className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'private'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            Private ({privateRecipes.length})
          </button>
        </div>

        {/* Recipe grid */}
        {displayRecipes.length === 0 ? (
          <div className="text-center py-16">
            <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No {activeTab} recipes yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayRecipes.map((recipe) => (
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
                  </div>

                  <div className="p-4">
                    <h3 className="text-gray-900 mb-2 line-clamp-2">{recipe.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                      <span>{recipe.duration}</span>
                      <span>•</span>
                      <span>{recipe.cuisine}</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => onViewRecipe(recipe)}
                    className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartCook(recipe);
                    }}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <ChefHat className="w-4 h-4" />
                    Cook
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
