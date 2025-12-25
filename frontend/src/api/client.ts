const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshToken(): Promise<string | null> {
  // Single-flight: if refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        accessToken = data.access_token;
        return accessToken;
      } else {
        accessToken = null;
        return null;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Token refresh failed:', error);
      if (error.name === 'AbortError') {
        console.error('Token refresh timed out');
      }
      accessToken = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    let response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      // Try to refresh token (single-flight)
      const newToken = await refreshToken();
      
      if (newToken) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), 10000);
        
        try {
          response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers,
            credentials: 'include',
            signal: retryController.signal,
          });
          clearTimeout(retryTimeoutId);
        } catch (retryError: any) {
          clearTimeout(retryTimeoutId);
          if (retryError.name === 'AbortError') {
            throw new Error('Request timeout - please check your connection');
          }
          throw retryError;
        }
      }
      // If refresh failed, return 401 response (caller will handle)
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please check your connection');
    }
    throw error;
  }
}

// Auth API
export const authAPI = {
  async signup(email: string, password: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'Signup failed';
        try {
          const error = await response.json();
          errorMessage = error.error?.message || error.message || `HTTP ${response.status}: ${response.statusText}`;
        } catch (e) {
          // Response is not JSON
          errorMessage = `HTTP ${response.status}: ${response.statusText || 'Signup failed'}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      accessToken = data.access_token;
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please check your connection and ensure the backend is running');
      }
      throw error;
    }
  },

  async login(email: string, password: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'Login failed';
        try {
          const error = await response.json();
          errorMessage = error.error?.message || error.message || `HTTP ${response.status}: ${response.statusText}`;
        } catch (e) {
          // Response is not JSON
          errorMessage = `HTTP ${response.status}: ${response.statusText || 'Login failed'}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      accessToken = data.access_token;
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please check your connection and ensure the backend is running');
      }
      throw error;
    }
  },

  async refresh() {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    accessToken = data.access_token;
    return data;
  },

  async logout() {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    accessToken = null;
  },
};

// Recipe API
export const recipeAPI = {
  async createYoutubeImport(url: string) {
    const response = await fetchWithAuth('/recipes/import/youtube', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Import failed');
    }

    return response.json();
  },

  async getImportJob(jobId: string) {
    const response = await fetchWithAuth(`/recipes/import-jobs/${jobId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get job status');
    }

    return response.json();
  },

  async getRecipe(recipeId: string) {
    const response = await fetchWithAuth(`/recipes/${recipeId}`);

    if (!response.ok) {
      let errorMessage = 'Failed to get recipe';
      try {
        const error = await response.json();
        errorMessage = error.error?.message || errorMessage;
      } catch {
        // Response might not be JSON
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },
};

// User API
export const userAPI = {
  async getMe() {
    const response = await fetchWithAuth('/users/me');

    if (!response.ok) {
      let errorMessage = 'Failed to get user';
      try {
        const error = await response.json();
        errorMessage = error.error?.message || errorMessage;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },
};

