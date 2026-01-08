import React from 'react';
import { Home, BookOpen, Users, Search, Plus, User, Settings, ChefHat, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import type { User as UserType } from '../../types';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  currentScreen: string;
  onNavigate: (screen: any) => void;
  currentUser: UserType;
  onLogout: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, currentScreen, onNavigate, currentUser, onLogout }: SidebarProps) {
  const navItems = [
    { id: 'myrecipes', icon: Home, label: 'Home' },
    { id: 'cookbooks', icon: BookOpen, label: 'Cookbooks' },
    { id: 'feed', icon: Users, label: 'Feed' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'} hidden md:flex`}>
      {/* Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-gray-100">
        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <ChefHat className="w-6 h-6 text-white" />
        </div>
        {!collapsed && <span className="text-gray-900">CookFlow</span>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id || 
            (item.id === 'myrecipes' && currentScreen === 'recipedetail') ||
            (item.id === 'cookbooks' && currentScreen === 'cookbookdetail');
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-100 space-y-2">
        {!collapsed ? (
          <div className="flex items-center gap-3 px-2 py-2">
            <img
              src={currentUser.avatar || '/default_profile.png'}
              alt={currentUser.name}
              className="w-10 h-10 rounded-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/default_profile.png';
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900 truncate">{currentUser.name}</div>
              <div className="text-xs text-gray-500">View profile</div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate('profile')}
            className="w-full flex justify-center"
          >
            <img
              src={currentUser.avatar || '/default_profile.png'}
              alt={currentUser.name}
              className="w-10 h-10 rounded-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/default_profile.png';
              }}
            />
          </button>
        )}
        
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-gray-500"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </div>
  );
}
