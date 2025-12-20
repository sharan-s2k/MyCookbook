import React, { useState } from 'react';
import { Search, ChefHat, Save, User, UserPlus } from 'lucide-react';
import type { Recipe } from '../../types';

interface SearchScreenProps {
  recipes: Recipe[];
  onViewRecipe: (recipe: Recipe) => void;
  onStartCook: (recipe: Recipe) => void;
}

type SearchTab = 'recipes' | 'users' | 'mylibrary';

export function SearchScreen({ recipes, onViewRecipe, onStartCook }: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('recipes');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const publicRecipes: Recipe[] = [
    ...recipes.filter(r => r.isPublic),
    {
      id: 'public1',
      title: 'Pad Thai',
      thumbnail: 'https://images.unsplash.com/photo-1635661988046-306631057df3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb29raW5nJTIwcmVjaXBlJTIwZm9vZHxlbnwxfHx8fDE3NjU5ODIzNzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
      isPublic: true,
      duration: '30 min',
      cuisine: 'Thai',
      cookbookIds: [],
      createdAt: new Date(),
      description: 'Classic Thai stir-fried noodles',
      ingredients: [],
      steps: [],
      userId: 'other',
      author: { id: 'other', name: 'Thai Kitchen', avatar: 'https://i.pravatar.cc/150?img=20' },
    },
  ];

  const users = [
    { id: 'u1', name: 'Jamie Oliver', avatar: 'https://i.pravatar.cc/150?img=12', recipes: 245, followers: '2.4M' },
    { id: 'u2', name: 'Gordon Ramsay', avatar: 'https://i.pravatar.cc/150?img=13', recipes: 189, followers: '1.8M' },
    { id: 'u3', name: 'Sarah Martinez', avatar: 'https://i.pravatar.cc/150?img=5', recipes: 67, followers: '45K' },
  ];

  const filteredRecipes = activeTab === 'mylibrary'
    ? recipes.filter(r => r.title.toLowerCase().includes(query.toLowerCase()))
    : publicRecipes.filter(r => r.title.toLowerCase().includes(query.toLowerCase()));

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()));

  const handleSave = (recipeId: string) => {
    setSavedIds(prev => new Set(prev).add(recipeId));
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Search input */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
            <input
              type="text"
              placeholder="Search recipes, users, ingredients..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="w-full pl-14 pr-4 py-4 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('recipes')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'recipes'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Recipes
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('mylibrary')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'mylibrary'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            My Library
          </button>
        </div>

        {/* Results */}
        {query === '' ? (
          <div className="text-center py-16">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Start typing to search...</p>
          </div>
        ) : (
          <>
            {/* Recipe results */}
            {(activeTab === 'recipes' || activeTab === 'mylibrary') && (
              <div className="space-y-3">
                {filteredRecipes.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No recipes found</p>
                  </div>
                ) : (
                  filteredRecipes.map((recipe) => {
                    const isSaved = savedIds.has(recipe.id) || recipe.userId !== 'other';
                    
                    return (
                      <div
                        key={recipe.id}
                        className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                      >
                        <img
                          src={recipe.thumbnail}
                          alt={recipe.title}
                          className="w-24 h-24 rounded-lg object-cover flex-shrink-0 cursor-pointer"
                          onClick={() => onViewRecipe(recipe)}
                        />
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => onViewRecipe(recipe)}
                        >
                          <h3 className="text-gray-900 mb-1">{recipe.title}</h3>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span>{recipe.duration}</span>
                            <span>•</span>
                            <span>{recipe.cuisine}</span>
                            {recipe.author && (
                              <>
                                <span>•</span>
                                <span>by {recipe.author.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {recipe.userId === 'other' && (
                            <button
                              onClick={() => handleSave(recipe.id)}
                              disabled={isSaved}
                              className={`px-4 py-2 rounded-lg transition-colors ${
                                isSaved
                                  ? 'bg-green-50 text-green-600 cursor-not-allowed'
                                  : 'border border-orange-500 text-orange-500 hover:bg-orange-50'
                              }`}
                            >
                              {isSaved ? 'Saved' : 'Save'}
                            </button>
                          )}
                          <button
                            onClick={() => onStartCook(recipe)}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                          >
                            <ChefHat className="w-4 h-4" />
                            Cook
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* User results */}
            {activeTab === 'users' && (
              <div className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No users found</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                    >
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      />
                      <div className="flex-1">
                        <h3 className="text-gray-900 mb-1">{user.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{user.recipes} recipes</span>
                          <span>•</span>
                          <span>{user.followers} followers</span>
                        </div>
                      </div>
                      <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                        <UserPlus className="w-4 h-4" />
                        Follow
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
