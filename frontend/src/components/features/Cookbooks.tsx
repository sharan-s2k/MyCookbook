import React, { useState } from 'react';
import { Plus, MoreVertical, Edit, Trash2, BookOpen, X } from 'lucide-react';
import type { Cookbook } from '../../types';

interface CookbooksProps {
  cookbooks: Cookbook[];
  onViewCookbook: (cookbook: Cookbook) => void;
  onDeleteCookbook: (id: string) => void;
  onCreateCookbook?: (title: string) => void;
  onRenameCookbook?: (id: string, newTitle: string) => void;
}

export function Cookbooks({ cookbooks, onViewCookbook, onDeleteCookbook, onCreateCookbook, onRenameCookbook }: CookbooksProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showNewCookbook, setShowNewCookbook] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [renameTitle, setRenameTitle] = useState('');

  const handleCreateCookbook = () => {
    if (newTitle.trim() && onCreateCookbook) {
      onCreateCookbook(newTitle.trim());
      setShowNewCookbook(false);
      setNewTitle('');
    }
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
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-gray-900 mb-1 truncate">{cookbook.title}</h3>
                    <p className="text-sm text-gray-500">
                      {cookbook.recipeCount} {cookbook.recipeCount === 1 ? 'recipe' : 'recipes'}
                    </p>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === cookbook.id ? null : cookbook.id);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    <MoreVertical className="w-4 h-4 text-gray-600" />
                  </button>

                  {menuOpen === cookbook.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(null);
                        }}
                      />
                      <div className="absolute right-4 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
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
                        <div className="border-t border-gray-100 my-2"></div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCookbook(cookbook.id);
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
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-6"
              autoFocus
            />
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
