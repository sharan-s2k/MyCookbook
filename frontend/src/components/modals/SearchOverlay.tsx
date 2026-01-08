import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User, ChefHat, Loader2 } from 'lucide-react';
import { searchAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

interface SearchUser {
  id: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  highlight?: {
    displayName?: string;
    username?: string;
    bio?: string;
  };
}

interface SearchRecipe {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  highlight?: {
    title?: string;
    description?: string;
  };
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchScope = 'all' | 'users' | 'recipes';

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ users?: SearchUser[]; recipes?: SearchRecipe[] }>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults({});
      setLoading(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchAPI.search(query, scope);
        setResults(data);
      } catch (error) {
        console.error('Search failed:', error);
        setResults({});
      } finally {
        setLoading(false);
      }
    }, 250); // 250ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, scope]);

  const handleUserClick = (userId: string) => {
    onClose();
    navigate(`/profile/${userId}`);
  };

  const handleRecipeClick = (recipeId: string) => {
    onClose();
    navigate(`/recipes/${recipeId}`);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      
      {/* Overlay */}
      <div className="fixed inset-x-0 top-0 z-50 bg-white shadow-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search recipes, users, ingredients..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm md:text-base"
              />
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close search"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Filter chips */}
          <div className="max-w-4xl mx-auto mt-3 flex gap-2">
            {(['all', 'users', 'recipes'] as SearchScope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  scope === s
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : s === 'users' ? 'Users' : 'Recipes'}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-4">
            {!query.trim() ? (
              <div className="text-center py-16">
                <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Start typing to search...</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              </div>
            ) : scope === 'all' ? (
              <>
                {/* Recipes section */}
                {results.recipes && results.recipes.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-2">
                      <ChefHat className="w-4 h-4" />
                      Recipes
                    </h3>
                    <div className="space-y-2">
                      {results.recipes.map((recipe) => (
                        <div
                          key={recipe.id}
                          onClick={() => handleRecipeClick(recipe.id)}
                          className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                        >
                          {recipe.thumbnailUrl && (
                            <img
                              src={recipe.thumbnailUrl}
                              alt={recipe.title}
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/default_recipe.jpg';
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4
                              className="text-gray-900 mb-1"
                              dangerouslySetInnerHTML={{
                                __html: recipe.highlight?.title || recipe.title,
                              }}
                            />
                            {recipe.description && (
                              <p
                                className="text-sm text-gray-500 line-clamp-2"
                                dangerouslySetInnerHTML={{
                                  __html: recipe.highlight?.description || recipe.description,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Users section */}
                {results.users && results.users.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Users
                    </h3>
                    <div className="space-y-2">
                      {results.users.map((user) => (
                        <div
                          key={user.id}
                          onClick={() => handleUserClick(user.id)}
                          className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                        >
                          <img
                            src={user.avatarUrl || '/default_profile.png'}
                            alt={user.displayName || user.username || 'User'}
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = '/default_profile.png';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <h4
                              className="text-gray-900 mb-1"
                              dangerouslySetInnerHTML={{
                                __html: user.highlight?.displayName || user.displayName || user.username || 'User',
                              }}
                            />
                            {user.username && (
                              <p className="text-sm text-gray-500">@{user.username}</p>
                            )}
                            {user.bio && (
                              <p
                                className="text-sm text-gray-500 line-clamp-1 mt-1"
                                dangerouslySetInnerHTML={{
                                  __html: user.highlight?.bio || user.bio,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {(!results.recipes || results.recipes.length === 0) &&
                  (!results.users || results.users.length === 0) && (
                    <div className="text-center py-16">
                      <p className="text-gray-500">No results found</p>
                    </div>
                  )}
              </>
            ) : scope === 'recipes' ? (
              results.recipes && results.recipes.length > 0 ? (
                <div className="space-y-2">
                  {results.recipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      onClick={() => handleRecipeClick(recipe.id)}
                      className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                    >
                      {recipe.thumbnailUrl && (
                        <img
                          src={recipe.thumbnailUrl}
                          alt={recipe.title}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = '/default_recipe.jpg';
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4
                          className="text-gray-900 mb-1"
                          dangerouslySetInnerHTML={{
                            __html: recipe.highlight?.title || recipe.title,
                          }}
                        />
                        {recipe.description && (
                          <p
                            className="text-sm text-gray-500 line-clamp-2"
                            dangerouslySetInnerHTML={{
                              __html: recipe.highlight?.description || recipe.description,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-gray-500">No recipes found</p>
                </div>
              )
            ) : scope === 'users' ? (
              results.users && results.users.length > 0 ? (
                <div className="space-y-2">
                  {results.users.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleUserClick(user.id)}
                      className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <img
                        src={user.avatarUrl || '/default_profile.png'}
                        alt={user.displayName || user.username || 'User'}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/default_profile.png';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4
                          className="text-gray-900 mb-1"
                          dangerouslySetInnerHTML={{
                            __html: user.highlight?.displayName || user.displayName || user.username || 'User',
                          }}
                        />
                        {user.username && (
                          <p className="text-sm text-gray-500">@{user.username}</p>
                        )}
                        {user.bio && (
                          <p
                            className="text-sm text-gray-500 line-clamp-1 mt-1"
                            dangerouslySetInnerHTML={{
                              __html: user.highlight?.bio || user.bio,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-gray-500">No users found</p>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

