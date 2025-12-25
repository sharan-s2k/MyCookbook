import React, { useState, useRef } from 'react';
import { ChefHat, Loader } from 'lucide-react';
import { authAPI } from '../../api/client';

interface AuthScreenProps {
  onLogin: () => Promise<void>;
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isProcessingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent double submission using both state and ref
    if (loading || isProcessingRef.current) {
      console.log('Prevented double submission', { loading, isProcessing: isProcessingRef.current });
      return;
    }

    // Additional check: if form is disabled, don't process
    if (formRef.current?.hasAttribute('data-processing')) {
      console.log('Form already processing');
      return;
    }

    setError('');
    setLoading(true);
    isProcessingRef.current = true;
    formRef.current?.setAttribute('data-processing', 'true');

    try {
      console.log('Starting auth:', { isSignup, email });
      let authResult;
      
      const authStartTime = Date.now();
      if (isSignup) {
        console.log('Calling authAPI.signup...');
        authResult = await authAPI.signup(email, password);
      } else {
        console.log('Calling authAPI.login...');
        authResult = await authAPI.login(email, password);
      }
      const authDuration = Date.now() - authStartTime;
      console.log(`Auth API call completed in ${authDuration}ms`, { hasToken: !!authResult?.access_token });

      // Only proceed if we got a valid response with access token
      if (authResult && authResult.access_token) {
        // Success - fetch user profile and mark as logged in
        console.log('Calling onLogin...');
        const loginStartTime = Date.now();
        try {
          await onLogin();
          const loginDuration = Date.now() - loginStartTime;
          console.log(`onLogin completed successfully in ${loginDuration}ms`);
          // If onLogin succeeds, component will unmount (user is logged in)
          // So we don't need to set loading to false
          return;
        } catch (loginError: any) {
          // Profile fetch failed - show error but keep form usable
          console.error('Failed to complete login:', loginError);
          console.error('Login error details:', {
            message: loginError?.message,
            stack: loginError?.stack,
            name: loginError?.name,
          });
          setError(loginError?.message || 'Login succeeded but failed to load your profile. Please refresh the page.');
          setLoading(false);
          isProcessingRef.current = false;
          formRef.current?.removeAttribute('data-processing');
          return;
        }
      } else {
        throw new Error('Invalid response from server - no access token received');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      console.error('Auth error details:', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
      const message: string =
        err?.message || (isSignup ? 'Signup failed. Please try again.' : 'Login failed. Please try again.');

      // Check if it's an invalid credentials error
      if (!isSignup && (message.includes('Invalid email') || message.includes('Invalid password') || message.includes('401'))) {
        setError('Invalid email or password. This account does not exist. Please create a new account below.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
      formRef.current?.removeAttribute('data-processing');
    }
  };

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

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
          <div>
            <label className="block text-sm text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="At least 8 characters"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || isProcessingRef.current}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader className="w-5 h-5 animate-spin" />}
            {isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          onClick={() => {
            setIsSignup(!isSignup);
            setError('');
          }}
          className="w-full text-gray-600 hover:text-gray-900 text-sm"
        >
          {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      </div>
    </div>
  );
}
