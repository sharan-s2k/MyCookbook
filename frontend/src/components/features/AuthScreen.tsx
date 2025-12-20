import React from 'react';
import { ChefHat } from 'lucide-react';

interface AuthScreenProps {
  onLogin: () => void;
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4">
          <ChefHat className="w-8 h-8 text-white" />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-orange-600">CookFlow</h1>
          <p className="text-gray-600 max-w-sm mx-auto">
            Turn YouTube videos into cookable recipes. Hands-free Cook Mode with voice + AI.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={onLogin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={onLogin}
            className="w-full bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-lg border-2 border-gray-200 transition-colors"
          >
            Create account
          </button>
        </div>

        <p className="text-sm text-gray-500 pt-4">
          Start saving recipes, organizing cookbooks, and cooking hands-free
        </p>
      </div>
    </div>
  );
}
