import { useState, useRef } from 'react';
import { Plus, MoreVertical, Edit, Trash2, BookOpen, X, Lock, Globe, Eye, EyeOff } from 'lucide-react';
import type { Cookbook } from '../../types';

interface CookbooksProps {
  cookbooks: Cookbook[];
  onViewCookbook: (cookbook: Cookbook) => void;
  onDeleteCookbook: (id: string) => void;
  onCreateCookbook?: (title: string, visibility?: 'PRIVATE' | 'PUBLIC') => void;
  onRenameCookbook?: (id: string, newTitle: string) => void;
  onToggleVisibility?: (id: string, visibility: 'PRIVATE' | 'PUBLIC') => void;
}

export function Cookbooks({ cookbooks, onViewCookbook, onDeleteCookbook, onCreateCookbook, onRenameCookbook, onToggleVisibility }: CookbooksProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement>>({});
  const [showNewCookbook, setShowNewCookbook] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newVisibility, setNewVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [renameTitle, setRenameTitle] = useState('');

  const handleCreateCookbook = () => {
    if (newTitle.trim() && onCreateCookbook) {
      onCreateCookbook(newTitle.trim(), newVisibility);
      setShowNewCookbook(false);
      setNewTitle('');
      setNewVisibility('PRIVATE');
    }
  };

  const handleToggleVisibility = (cookbook: Cookbook) => {
    if (onToggleVisibility) {
      const newVisibility = cookbook.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
      onToggleVisibility(cookbook.id, newVisibility);
    }
    setMenuOpen(null);
    setMenuPosition(null);
  };

  const handleRenameCookbook = (id: string) => {
    if (renameTitle.trim() && onRenameCookbook) {
      onRenameCookbook(id, renameTitle.trim());
      setShowRenameModal(null);
      setRenameTitle('');
    }
  };

  const handleRenameClick = (cookbook: Cookbook) => {
    setRenameTitle(cookbook.title);
    setShowRenameModal(cookbook.id);
    setMenuOpen(null);
    setMenuPosition(null);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Organize your recipes into collections</p>
        </div>
        <button
          onClick={() => setShowNewCookbook(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          New cookbook
        </button>
      </div>

      {cookbooks.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-gray-600 mb-2">No cookbooks yet</h3>
          <p className="text-gray-500 text-sm">Create a cookbook to organize your recipes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {cookbooks.map((cookbook) => (
            <div
              key={cookbook.id}
              className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow group cursor-pointer"
              onClick={() => onViewCookbook(cookbook)}
            >
              {/* Preview grid */}
              <div className="aspect-square grid grid-cols-2 gap-1 p-1 bg-gray-100">
                {cookbook.previewImages.slice(0, 4).map((img, idx) => (
                  <div key={idx} className="bg-gray-200 rounded-lg overflow-hidden">
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {cookbook.previewImages.length < 4 && Array.from({ length: 4 - cookbook.previewImages.length }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="bg-gray-200 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-gray-400" />
                  </div>
                ))}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-2 relative">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-gray-900 truncate">{cookbook.title}</h3>
                      {cookbook.visibility === 'PUBLIC' ? (
                        <div className="bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1 flex-shrink-0">
                          <Globe className="w-3 h-3 text-blue-600" />
                          <span className="text-xs text-blue-600">Public</span>
                        </div>
                      ) : (
                        <div className="bg-gray-50 px-2 py-0.5 rounded-md flex items-center gap-1 flex-shrink-0">
                          <Lock className="w-3 h-3 text-gray-600" />
                          <span className="text-xs text-gray-600">Private</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {(cookbook.recipeCount || cookbook.recipe_count || 0)} {(cookbook.recipeCount || cookbook.recipe_count || 0) === 1 ? 'recipe' : 'recipes'}
                    </p>
                  </div>
                  
                  <div className="relative flex-shrink-0">
                    <button
                      ref={(el) => {
                        if (el) menuButtonRefs.current[cookbook.id] = el;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (menuOpen === cookbook.id) {
                          setMenuOpen(null);
                          setMenuPosition(null);
                        } else {
                          const button = menuButtonRefs.current[cookbook.id];
                          if (button) {
                            const rect = button.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 8,
                              right: window.innerWidth - rect.right,
                            });
                          }
                          setMenuOpen(cookbook.id);
                        }
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>

                {menuOpen === cookbook.id && menuPosition && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(null);
                        setMenuPosition(null);
                      }}
                    />
                    <div
                      className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20"
                      style={{
                        top: `${menuPosition.top}px`,
                        right: `${menuPosition.right}px`,
                      }}
                    >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameClick(cookbook);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                        >
                          <Edit className="w-4 h-4" />
                          Rename
                        </button>
                        {cookbook.is_owner && (
                          <>
                            <div className="border-t border-gray-100 my-2"></div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleVisibility(cookbook);
                              }}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                            >
                              {cookbook.visibility === 'PUBLIC' ? (
                                <>
                                  <EyeOff className="w-4 h-4" />
                                  Make private
                                </>
                              ) : (
                                <>
                                  <Eye className="w-4 h-4" />
                                  Make public
                                </>
                              )}
                            </button>
                          </>
                        )}
                        <div className="border-t border-gray-100 my-2"></div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCookbook(cookbook.id);
                            setMenuOpen(null);
                            setMenuPosition(null);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-red-50 flex items-center gap-2 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewCookbook(cookbook);
                  }}
                  className="w-full mt-3 border border-orange-500 text-orange-500 hover:bg-orange-50 px-4 py-2 rounded-lg transition-colors"
                >
                  View recipes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New cookbook modal */}
      {showNewCookbook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900">Create new cookbook</h3>
              <button
                onClick={() => {
                  setShowNewCookbook(false);
                  setNewTitle('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Cookbook name"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateCookbook();
                }
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
              autoFocus
            />
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNewVisibility('PRIVATE')}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                    newVisibility === 'PRIVATE'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setNewVisibility('PUBLIC')}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                    newVisibility === 'PUBLIC'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Public
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewCookbook(false);
                  setNewTitle('');
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCookbook}
                disabled={!newTitle.trim()}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename cookbook modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900">Rename cookbook</h3>
              <button
                onClick={() => {
                  setShowRenameModal(null);
                  setRenameTitle('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Cookbook name"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && showRenameModal) {
                  handleRenameCookbook(showRenameModal);
                }
              }}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-6"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRenameModal(null);
                  setRenameTitle('');
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => showRenameModal && handleRenameCookbook(showRenameModal)}
                disabled={!renameTitle.trim()}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
