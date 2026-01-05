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
  async listRecipes() {
    const response = await fetchWithAuth('/recipes');

    if (!response.ok) {
      let errorMessage = 'Failed to list recipes';
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

  async getImportJob(jobId: string, etag?: string) {
    const headers: HeadersInit = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    const response = await fetchWithAuth(`/recipes/import-jobs/${jobId}`, {
      headers,
    });

    // Extract headers before checking status (headers available on 304)
    const responseEtag = response.headers.get('ETag');
    const retryAfter = response.headers.get('Retry-After');

    // Handle 304 Not Modified (no change)
    if (response.status === 304) {
      return {
        unchanged: true,
        _etag: responseEtag || undefined,
        _retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
      };
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get job status');
    }

    const data = await response.json();
    
    return {
      ...data,
      _etag: responseEtag || undefined,
      _retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
    };
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

  async updateRecipe(recipeId: string, updates: {
    title?: string;
    description?: string | null;
    ingredients?: any;
    steps?: any;
  }) {
    const response = await fetchWithAuth(`/recipes/${recipeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to update recipe';
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

  async deleteRecipe(recipeId: string) {
    const response = await fetchWithAuth(`/recipes/${recipeId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      let errorMessage = 'Failed to delete recipe';
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

// AI API
export const aiAPI = {
  async chat(recipe: {
    id: string;
    title: string;
    description?: string;
    ingredients: Array<{ qty: string; unit: string; item: string }>;
    steps: Array<{ text: string; index?: number }>;
  }, userMessage: string, currentStepIndex?: number) {
    const response = await fetchWithAuth('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        recipe_id: recipe.id,
        title: recipe.title,
        description: recipe.description || null,
        ingredients: recipe.ingredients,
        steps: recipe.steps.map(step => ({
          text: step.text,
          index: step.index || null,
        })),
        user_message: userMessage,
        current_step_index: currentStepIndex !== undefined ? currentStepIndex : null,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to get AI response';
      try {
        const error = await response.json();
        errorMessage = error.error?.message || error.error?.detail || errorMessage;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.message;
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

// Cookbook API
export const cookbookAPI = {
  async listCookbooks() {
    const response = await fetchWithAuth('/cookbooks');

    if (!response.ok) {
      let errorMessage = 'Failed to list cookbooks';
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

  async createCookbook(title: string, description?: string, visibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE') {
    const response = await fetchWithAuth('/cookbooks', {
      method: 'POST',
      body: JSON.stringify({ title, description, visibility }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to create cookbook';
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

  async getCookbook(cookbookId: string) {
    const response = await fetchWithAuth(`/cookbooks/${cookbookId}`);

    if (!response.ok) {
      let errorMessage = 'Failed to get cookbook';
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

  async updateCookbook(cookbookId: string, updates: { title?: string; description?: string; visibility?: 'PRIVATE' | 'PUBLIC' }) {
    const response = await fetchWithAuth(`/cookbooks/${cookbookId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to update cookbook';
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

  async deleteCookbook(cookbookId: string) {
    const response = await fetchWithAuth(`/cookbooks/${cookbookId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      let errorMessage = 'Failed to delete cookbook';
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

  async saveCookbook(cookbookId: string) {
    const response = await fetchWithAuth(`/cookbooks/${cookbookId}/save`, {
      method: 'POST',
    });

    if (!response.ok) {
      let errorMessage = 'Failed to save cookbook';
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

  async unsaveCookbook(cookbookId: string) {
    const response = await fetchWithAuth(`/cookbooks/${cookbookId}/save`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      let errorMessage = 'Failed to unsave cookbook';
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

  async setRecipeCookbooks(recipeId: string, cookbookIds: string[]) {
    const response = await fetchWithAuth(`/cookbooks/recipes/${recipeId}/cookbooks`, {
      method: 'POST',
      body: JSON.stringify({ cookbook_ids: cookbookIds }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to update recipe cookbooks';
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

  async getRecipeCookbooks(recipeId: string) {
    const response = await fetchWithAuth(`/cookbooks/recipes/${recipeId}/cookbooks`);

    if (!response.ok) {
      let errorMessage = 'Failed to get recipe cookbooks';
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

