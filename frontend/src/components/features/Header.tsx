import React, { useState } from 'react';
import { Plus, Bell, Search, ChevronDown, BookOpen, Save, LogOut, Menu } from 'lucide-react';
import type { User } from '../../types';

interface HeaderProps {
  currentScreen: string;
  onOpenCreate: () => void;
  currentUser: User;
  onNavigate: (screen: any) => void;
  onMenuClick?: () => void;
}

const screenTitles: Record<string, string> = {
  myrecipes: 'My Recipes',
  cookbooks: 'Cookbooks',
  cookbookdetail: 'Cookbook',
  feed: 'Feed',
  search: 'Search',
  profile: 'Profile',
  recipedetail: 'Recipe',
  cookmode: 'Cook Mode',
};

export function Header({ currentScreen, onOpenCreate, currentUser, onNavigate, onMenuClick }: HeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
      <div className="flex items-center gap-3 md:gap-6">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        
        {/* Page title */}
        <h2 className="text-gray-900 text-lg md:text-xl min-w-0 md:min-w-[150px] truncate">
          {screenTitles[currentScreen] || 'CookFlow'}
        </h2>

        {/* Universal search */}
        {currentScreen !== 'cookmode' && (
          <div className="flex-1 max-w-2xl hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search recipes, users, ingredients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => onNavigate('search')}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm md:text-base"
              />
            </div>
          </div>
        )}

        {/* Right actions */}
        {currentScreen !== 'cookmode' && (
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={onOpenCreate}
              className="flex items-center gap-1 md:gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 md:px-4 py-2 rounded-lg transition-colors text-sm md:text-base"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden sm:inline">Create</span>
            </button>

            <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors hidden sm:block">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"></span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-1 md:gap-2 hover:bg-gray-100 px-1 md:px-2 py-2 rounded-lg transition-colors"
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-7 h-7 md:w-8 md:h-8 rounded-full object-cover"
                />
                <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-gray-500 hidden sm:block" />
              </button>

              {showProfileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    <button
                      onClick={() => {
                        onOpenCreate();
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                    >
                      <Plus className="w-4 h-4" />
                      New recipe
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('cookbooks');
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                    >
                      <BookOpen className="w-4 h-4" />
                      New cookbook
                    </button>
                    <div className="border-t border-gray-100 my-2"></div>
                    <button
                      onClick={() => {
                        onNavigate('myrecipes');
                        setShowProfileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                    >
                      <Save className="w-4 h-4" />
                      Saved
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
