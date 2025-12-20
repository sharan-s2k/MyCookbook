import React, { useState } from 'react';
import { X, Plus, BookOpen } from 'lucide-react';
import type { Cookbook } from '../../types';

interface CookbookSelectModalProps {
  cookbooks: Cookbook[];
  onSelect: (cookbookId: string | null) => void;
  onClose: () => void;
  onNewCookbook?: () => void;
  title?: string;
  allowNew?: boolean;
}

export function CookbookSelectModal({ 
  cookbooks, 
  onSelect, 
  onClose, 
  onNewCookbook,
  title = 'Select Cookbook',
  allowNew = true 
}: CookbookSelectModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = () => {
    onSelect(selectedId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-96 overflow-y-auto">
          {allowNew && onNewCookbook && (
            <button
              onClick={() => {
                onNewCookbook();
                onClose();
              }}
              className="w-full mb-4 flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-colors text-gray-700"
            >
              <Plus className="w-5 h-5" />
              <span>Create new cookbook</span>
            </button>
          )}

          {cookbooks.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No cookbooks yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setSelectedId(null)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                  selectedId === null
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-gray-900">None (Remove from cookbook)</div>
              </button>
              {cookbooks.map((cookbook) => (
                <button
                  key={cookbook.id}
                  onClick={() => setSelectedId(cookbook.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    selectedId === cookbook.id
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{cookbook.title}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {cookbook.recipeCount} {cookbook.recipeCount === 1 ? 'recipe' : 'recipes'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}

