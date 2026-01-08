import React, { useState, createContext, useContext, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { AuthScreen } from './components/features/AuthScreen';
import { Sidebar } from './components/features/Sidebar';
import { Header } from './components/features/Header';
import { MyRecipes } from './components/features/MyRecipes';
import { Cookbooks } from './components/features/Cookbooks';
import { Feed } from './components/features/Feed';
import { Profile } from './components/features/Profile';
import { RecipeDetail } from './components/features/RecipeDetail';
import { CookMode } from './components/features/CookMode';
import { CreateModal } from './components/modals/CreateModal';
import { authAPI, recipeAPI, userAPI, cookbookAPI, setAccessToken, getAccessToken } from './api/client';
import type { Recipe, Cookbook, User, FeedPost } from './types';

type AppContextType = {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  updateRecipeInStore: (updatedRecipe: Partial<Recipe> & { id: string }) => void;
  cookbooks: Cookbook[];
  setCookbooks: React.Dispatch<React.SetStateAction<Cookbook[]>>;
  feedPosts: FeedPost[];
  setFeedPosts: React.Dispatch<React.SetStateAction<FeedPost[]>>;
  showCreateModal: boolean;
  setShowCreateModal: (value: boolean) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within App');
  }
  return context;
};

// Layout component for authenticated routes
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, setShowCreateModal, setIsAuthenticated } = useAppContext();

  const getCurrentScreen = () => {
    const path = location.pathname;
    if (path === '/') return 'myrecipes';
    if (path.startsWith('/cookbooks/')) return 'cookbookdetail';
    if (path.startsWith('/recipes/') && path.includes('/cook')) return 'cookmode';
    if (path.startsWith('/recipes/')) return 'recipedetail';
    return path.slice(1) as any;
  };

  const handleNavigate = (screen: string) => {
    setMobileMenuOpen(false);
    if (screen === 'myrecipes') navigate('/');
    else if (screen === 'cookbooks') navigate('/cookbooks');
    else if (screen === 'feed') navigate('/feed');
    else if (screen === 'profile') navigate('/profile');
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setIsAuthenticated(false);
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-neutral-50">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentScreen={getCurrentScreen()}
        onNavigate={handleNavigate}
        currentUser={currentUser!}
        onLogout={handleLogout}
      />
      
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50" onClick={(e) => e.stopPropagation()}>
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => {}}
              currentScreen={getCurrentScreen()}
              onNavigate={handleNavigate}
              currentUser={currentUser!}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          currentScreen={getCurrentScreen()}
          onOpenCreate={() => setShowCreateModal(true)}
          currentUser={currentUser!}
          onNavigate={handleNavigate}
          onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// Route components
function MyRecipesRoute() {
  const navigate = useNavigate();
  const { recipes, cookbooks, setRecipes, setCookbooks, updateRecipeInStore } = useAppContext();

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleUpdateRecipe = (updatedRecipe: Recipe) => {
    updateRecipeInStore(updatedRecipe);
  };

  const handleMoveToCookbook = async (recipeId: string, cookbookIds: string[]) => {
    try {
      await cookbookAPI.setRecipeCookbooks(recipeId, cookbookIds);
      // Update local state
      setRecipes(recipes.map(r => 
        r.id === recipeId ? { ...r, cookbookIds } : r
      ));
      // Refresh cookbooks to update counts
      const data = await cookbookAPI.listCookbooks();
      const allCookbooks: Cookbook[] = [
        ...(data.owned || []).map((cb: any) => ({
          id: cb.id,
          title: cb.title,
          description: cb.description,
          visibility: cb.visibility,
          recipe_count: cb.recipe_count || 0,
          recipeCount: cb.recipe_count || 0,
          previewImages: [],
          is_owner: true,
          owner_id: cb.owner_id,
        })),
        ...(data.saved || []).map((cb: any) => ({
          id: cb.id,
          title: cb.title,
          description: cb.description,
          visibility: cb.visibility,
          recipe_count: cb.recipe_count || 0,
          recipeCount: cb.recipe_count || 0,
          previewImages: [],
          is_owner: false,
          owner_id: cb.owner_id,
          saved_at: cb.saved_at,
        })),
      ];
      // Populate preview images from recipes
      const updatedRecipes = recipes.map(r => 
        r.id === recipeId ? { ...r, cookbookIds } : r
      );
      const cookbooksWithImages = allCookbooks.map((cb) => {
        const recipeIds = updatedRecipes.filter((r) => r.cookbookIds?.includes(cb.id)).map((r) => r.id);
        const previewImages = updatedRecipes
          .filter((r) => recipeIds.includes(r.id) && r.thumbnail)
          .slice(0, 4)
          .map((r) => r.thumbnail!);
        return { ...cb, previewImages };
      });
      setCookbooks(cookbooksWithImages);
    } catch (error: any) {
      console.error('Failed to update recipe cookbooks:', error);
      alert('Failed to save recipe to cookbook. Please try again.');
    }
  };


  return (
    <MyRecipes
      recipes={recipes}
      cookbooks={cookbooks}
      onViewRecipe={handleViewRecipe}
      onStartCook={handleStartCook}
      onDeleteRecipe={(id) => {
        const recipe = recipes.find(r => r.id === id);
        if (recipe) {
          const recipeCookbookIds = recipe.cookbookIds || [];
          setCookbooks(cookbooks.map(cb => ({
            ...cb,
            recipeCount: cb.recipeCount - (recipeCookbookIds.includes(cb.id) ? 1 : 0),
            previewImages: cb.previewImages.filter(img => img !== recipe.thumbnail)
          })));
        }
        setRecipes(recipes.filter(r => r.id !== id));
      }}
      onUpdateRecipe={handleUpdateRecipe}
      onMoveToCookbook={handleMoveToCookbook}
    />
  );
}

function CookbooksRoute() {
  const navigate = useNavigate();
  const { cookbooks, setCookbooks, recipes, setRecipes } = useAppContext();

  const handleViewCookbook = (cookbook: Cookbook) => {
    navigate(`/cookbooks/${cookbook.id}`);
  };

  const handleCreateCookbook = async (title: string, visibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE') => {
    try {
      const newCookbook = await cookbookAPI.createCookbook(title, undefined, visibility);
      const transformed: Cookbook = {
        id: newCookbook.id,
        title: newCookbook.title,
        description: newCookbook.description,
        visibility: newCookbook.visibility,
        recipe_count: newCookbook.recipe_count || 0,
        recipeCount: newCookbook.recipe_count || 0,
        previewImages: [],
        is_owner: true,
        owner_id: newCookbook.owner_id,
      };
      setCookbooks([...cookbooks, transformed]);
    } catch (error: any) {
      console.error('Failed to create cookbook:', error);
      throw error;
    }
  };

  const handleToggleCookbookVisibility = async (id: string, visibility: 'PRIVATE' | 'PUBLIC') => {
    try {
      await cookbookAPI.updateCookbook(id, { visibility });
      // Update local state immediately for better UX
      setCookbooks(cookbooks.map(cb => 
        cb.id === id ? { ...cb, visibility } : cb
      ));
      // Refresh cookbooks to get latest data from backend
      try {
        const data = await cookbookAPI.listCookbooks();
        const allCookbooks: Cookbook[] = [
          ...(data.owned || []).map((cb: any) => ({
            id: cb.id,
            title: cb.title,
            description: cb.description,
            visibility: cb.visibility,
            recipe_count: cb.recipe_count || 0,
            recipeCount: cb.recipe_count || 0,
            previewImages: [],
            is_owner: true,
            owner_id: cb.owner_id,
          })),
          ...(data.saved || []).map((cb: any) => ({
            id: cb.id,
            title: cb.title,
            description: cb.description,
            visibility: cb.visibility,
            recipe_count: cb.recipe_count || 0,
            recipeCount: cb.recipe_count || 0,
            previewImages: [],
            is_owner: false,
            owner_id: cb.owner_id,
            saved_at: cb.saved_at,
          })),
        ];
        // Populate preview images from current recipes state if available
        if (recipes && recipes.length > 0) {
          const cookbooksWithImages = allCookbooks.map((cb) => {
            const recipeIds = recipes.filter((r) => r.cookbookIds?.includes(cb.id)).map((r) => r.id);
            const previewImages = recipes
              .filter((r) => recipeIds.includes(r.id) && r.thumbnail)
              .slice(0, 4)
              .map((r) => r.thumbnail!);
            return { ...cb, previewImages };
          });
          setCookbooks(cookbooksWithImages);
        } else {
          setCookbooks(allCookbooks);
        }
      } catch (refreshError) {
        console.error('Failed to refresh cookbooks after toggle:', refreshError);
        // Already updated local state, so this is okay
      }
    } catch (error: any) {
      console.error('Failed to toggle cookbook visibility:', error);
      alert('Failed to update cookbook visibility. Please try again.');
    }
  };

  const handleRenameCookbook = async (id: string, newTitle: string) => {
    try {
      await cookbookAPI.updateCookbook(id, { title: newTitle });
      setCookbooks(cookbooks.map(cb => 
        cb.id === id ? { ...cb, title: newTitle } : cb
      ));
    } catch (error: any) {
      console.error('Failed to rename cookbook:', error);
      throw error;
    }
  };

  const handleDeleteCookbook = async (id: string) => {
    try {
      await cookbookAPI.deleteCookbook(id);
      // Remove cookbook from recipes
      setRecipes(recipes.map(r => ({
        ...r,
        cookbookIds: (r.cookbookIds || []).filter(cbId => cbId !== id)
      })));
      setCookbooks(cookbooks.filter(c => c.id !== id));
    } catch (error: any) {
      console.error('Failed to delete cookbook:', error);
      throw error;
    }
  };

  return (
    <Cookbooks
      cookbooks={cookbooks.filter(cb => cb.is_owner)}
      onViewCookbook={handleViewCookbook}
      onDeleteCookbook={handleDeleteCookbook}
      onCreateCookbook={handleCreateCookbook}
      onRenameCookbook={handleRenameCookbook}
      onToggleVisibility={handleToggleCookbookVisibility}
    />
  );
}

function CookbookDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes, cookbooks, setRecipes, setCookbooks, updateRecipeInStore } = useAppContext();
  const [cookbook, setCookbook] = useState<Cookbook | null>(null);
  const [cookbookRecipes, setCookbookRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const fetchCookbook = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const cookbookData = await cookbookAPI.getCookbook(id);
        const transformed: Cookbook = {
          id: cookbookData.id,
          title: cookbookData.title,
          description: cookbookData.description,
          visibility: cookbookData.visibility,
          recipe_count: cookbookData.recipe_count || 0,
          recipeCount: cookbookData.recipe_count || 0,
          recipe_ids: cookbookData.recipe_ids || [],
          previewImages: [],
          is_owner: cookbookData.is_owner,
          owner_id: cookbookData.owner_id,
        };
        setCookbook(transformed);

        // Fetch recipes for this cookbook
        if (cookbookData.recipe_ids && cookbookData.recipe_ids.length > 0) {
          const recipePromises = cookbookData.recipe_ids.map((recipeId: string) =>
            recipeAPI.getRecipe(recipeId).catch(() => null)
          );
          const recipeResults = await Promise.all(recipePromises);
          const validRecipes = recipeResults
            .filter((r): r is any => r !== null)
            .map((r: any) => ({
              id: r.id,
              title: r.title,
              description: r.description || '',
              source_type: r.source_type,
              source_ref: r.source_ref,
              youtubeUrl: r.source_type === 'youtube' ? r.source_ref : undefined,
              cookbookIds: [id], // This recipe belongs to this cookbook
              ingredients: Array.isArray(r.ingredients)
                ? r.ingredients.map((ing: any) => ({
                    qty: String(ing.qty),
                    unit: String(ing.unit),
                    item: String(ing.item),
                  }))
                : [],
              steps: r.steps.map((step: any) => ({
                text: step.text,
                timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
                timestamp_sec: step.timestamp_sec,
                index: step.index,
              })),
              createdAt: r.created_at,
              userId: r.owner_id,
              owner_id: r.owner_id,
            }));
          setCookbookRecipes(validRecipes);
        } else {
          setCookbookRecipes([]);
        }
      } catch (error) {
        console.error('Failed to fetch cookbook:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCookbook();
  }, [id]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!cookbook) return <div className="p-8">Cookbook not found</div>;

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleUpdateRecipe = (updatedRecipe: Recipe) => {
    updateRecipeInStore(updatedRecipe);
  };

  const handleMoveToCookbook = async (recipeId: string, cookbookIds: string[]) => {
    try {
      await cookbookAPI.setRecipeCookbooks(recipeId, cookbookIds);
      // Refresh cookbook recipes
      if (id) {
        const cookbookData = await cookbookAPI.getCookbook(id);
        if (cookbookData.recipe_ids && cookbookData.recipe_ids.length > 0) {
          const recipePromises = cookbookData.recipe_ids.map((rid: string) =>
            recipeAPI.getRecipe(rid).catch(() => null)
          );
          const recipeResults = await Promise.all(recipePromises);
          const validRecipes = recipeResults
            .filter((r): r is any => r !== null)
            .map((r: any) => ({
              id: r.id,
              title: r.title,
              description: r.description || '',
              source_type: r.source_type,
              source_ref: r.source_ref,
              youtubeUrl: r.source_type === 'youtube' ? r.source_ref : undefined,
              cookbookIds: [id],
              ingredients: Array.isArray(r.ingredients)
                ? r.ingredients.map((ing: any) => ({
                    qty: String(ing.qty),
                    unit: String(ing.unit),
                    item: String(ing.item),
                  }))
                : [],
              steps: r.steps.map((step: any) => ({
                text: step.text,
                timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
                timestamp_sec: step.timestamp_sec,
                index: step.index,
              })),
              createdAt: r.created_at,
              userId: r.owner_id,
              owner_id: r.owner_id,
            }));
          setCookbookRecipes(validRecipes);
        } else {
          setCookbookRecipes([]);
        }
      }
    } catch (error: any) {
      console.error('Failed to update recipe cookbooks:', error);
    }
  };

  return (
    <MyRecipes
      recipes={cookbookRecipes}
      cookbooks={cookbooks}
      onViewRecipe={handleViewRecipe}
      onStartCook={handleStartCook}
      onDeleteRecipe={async (id) => {
        try {
          await recipeAPI.deleteRecipe(id);
          setCookbookRecipes(cookbookRecipes.filter(r => r.id !== id));
        } catch (error) {
          console.error('Failed to delete recipe:', error);
        }
      }}
      onUpdateRecipe={handleUpdateRecipe}
      onMoveToCookbook={handleMoveToCookbook}
      cookbookTitle={cookbook.title}
      onBack={() => navigate('/cookbooks')}
    />
  );
}

function FeedRoute() {
  const navigate = useNavigate();
  const { feedPosts, recipes, setRecipes, currentUser } = useAppContext();

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleSaveRecipe = (recipe: Recipe) => {
    setRecipes([...recipes, { ...recipe, userId: currentUser.id, cookbookIds: [] }]);
  };

  return (
    <Feed
      posts={feedPosts}
      onViewRecipe={handleViewRecipe}
      onStartCook={handleStartCook}
      onSaveRecipe={handleSaveRecipe}
    />
  );
}


function ProfileRoute() {
  const navigate = useNavigate();
  const { currentUser, cookbooks, setCurrentUser } = useAppContext();

  const handleViewCookbook = (cookbook: Cookbook) => {
    navigate(`/cookbooks/${cookbook.id}`);
  };

  const handleUpdateUser = async (updates: { display_name?: string; bio?: string; avatar_url?: string }) => {
    await userAPI.updateProfile(updates);
    // Update current user in context
    setCurrentUser({
      ...currentUser,
      name: updates.display_name || currentUser.name,
      bio: updates.bio !== undefined ? updates.bio : currentUser.bio,
      avatar: updates.avatar_url || currentUser.avatar,
    });
  };

  // Filter cookbooks to only show user's own cookbooks
  const userCookbooks = cookbooks.filter(cb => cb.is_owner && cb.owner_id === currentUser.id);

  return (
    <Profile
      user={currentUser}
      cookbooks={userCookbooks}
      onViewCookbook={handleViewCookbook}
      onUpdateUser={handleUpdateUser}
    />
  );
}

function RecipeDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { cookbooks, updateRecipeInStore, setCookbooks, setRecipes, recipes } = useAppContext();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecipe = async () => {
      try {
        const [recipeData, cookbookIds] = await Promise.all([
          recipeAPI.getRecipe(id!),
          cookbookAPI.getRecipeCookbooks(id!).catch(() => []) // Get cookbook membership
        ]);
        // Transform backend format to frontend format
        const transformed: Recipe = {
          id: recipeData.id,
          title: recipeData.title,
          description: recipeData.description || '',
          source_type: recipeData.source_type,
          source_ref: recipeData.source_ref,
          youtubeUrl: recipeData.source_type === 'youtube' ? recipeData.source_ref : undefined,
          cookbookIds: cookbookIds, // Set current cookbook membership
          ingredients: Array.isArray(recipeData.ingredients)
            ? recipeData.ingredients.map((ing: any) => ({
                qty: String(ing.qty),
                unit: String(ing.unit),
                item: String(ing.item),
              }))
            : [],
          steps: recipeData.steps.map((step: any) => ({
            text: step.text,
            timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
            timestamp_sec: step.timestamp_sec,
            index: step.index,
          })),
          createdAt: recipeData.created_at,
        };
        setRecipe(transformed);
      } catch (error) {
        console.error('Failed to fetch recipe:', error);
      } finally {
        setLoading(false);
      }
    };
    if (id) {
      fetchRecipe();
    }
  }, [id]);

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!recipe) return <div className="p-8">Recipe not found</div>;

  const handleStartCookMode = () => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleUpdateRecipe = (updatedRecipe: Recipe) => {
    // Update local state immediately
    setRecipe(updatedRecipe);
    // Update global store so list views reflect changes immediately
    updateRecipeInStore(updatedRecipe);
  };

  const handleSaveToCookbook = async (recipeId: string, cookbookIds: string[]) => {
    try {
      await cookbookAPI.setRecipeCookbooks(recipeId, cookbookIds);
      // Update local state
      setRecipes(prev => prev.map(r => 
        r.id === recipeId ? { ...r, cookbookIds } : r
      ));
      // Update recipe in detail view if it's the current recipe
      if (recipe && recipe.id === recipeId) {
        setRecipe({ ...recipe, cookbookIds });
      }
      // Refresh cookbooks to update counts
      const data = await cookbookAPI.listCookbooks();
      const allCookbooks: Cookbook[] = [
        ...(data.owned || []).map((cb: any) => ({
          id: cb.id,
          title: cb.title,
          description: cb.description,
          visibility: cb.visibility,
          recipe_count: cb.recipe_count || 0,
          recipeCount: cb.recipe_count || 0,
          previewImages: [],
          is_owner: true,
          owner_id: cb.owner_id,
        })),
        ...(data.saved || []).map((cb: any) => ({
          id: cb.id,
          title: cb.title,
          description: cb.description,
          visibility: cb.visibility,
          recipe_count: cb.recipe_count || 0,
          recipeCount: cb.recipe_count || 0,
          previewImages: [],
          is_owner: false,
          owner_id: cb.owner_id,
          saved_at: cb.saved_at,
        })),
      ];
      setCookbooks(allCookbooks);
    } catch (error: any) {
      console.error('Failed to save recipe to cookbooks:', error);
      throw error;
    }
  };

  return (
    <RecipeDetail
      recipe={recipe}
      onStartCookMode={handleStartCookMode}
      onBack={() => navigate('/')}
      onUpdateRecipe={handleUpdateRecipe}
      onSaveToCookbook={handleSaveToCookbook}
      cookbooks={cookbooks.filter(cb => cb.is_owner)}
    />
  );
}

function CookModeRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecipe = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const data = await recipeAPI.getRecipe(id);
        // Transform backend format to frontend format
        const transformed: Recipe = {
          id: data.id,
          title: data.title,
          description: data.description || '',
          source_type: data.source_type,
          source_ref: data.source_ref,
          youtubeUrl: data.source_type === 'youtube' ? data.source_ref : undefined,
          ingredients: Array.isArray(data.ingredients)
            ? data.ingredients.map((ing: any) => ({
                qty: String(ing.qty),
                unit: String(ing.unit),
                item: String(ing.item),
              }))
            : [],
          steps: data.steps.map((step: any) => ({
            text: step.text,
            timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
            timestamp_sec: step.timestamp_sec,
            index: step.index,
          })),
          createdAt: new Date(data.created_at),
        };
        setRecipe(transformed);
      } catch (error) {
        console.error('Failed to fetch recipe for cook mode:', error);
        setRecipe(null);
      } finally {
        setLoading(false);
      }
    };
    fetchRecipe();
  }, [id]);

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!recipe) return <div className="p-8">Recipe not found</div>;

  const handleExit = () => {
    navigate(`/recipes/${recipe.id}`);
  };

  return (
    <CookMode
      recipe={recipe}
      onExit={handleExit}
    />
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false); // Start with false - show auth screen immediately
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isLoggingInRef = useRef(false);

  // All state hooks must be declared before any conditional returns
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);

  // Fetch cookbooks from backend
  const fetchCookbooks = async () => {
    try {
      console.log('Fetching cookbooks from backend...');
      const data = await cookbookAPI.listCookbooks();
      
      // Transform backend format to frontend format
      const allCookbooks: Cookbook[] = [
        ...(data.owned || []).map((cb: any) => ({
          id: cb.id,
          title: cb.title,
          description: cb.description,
          visibility: cb.visibility,
          recipe_count: cb.recipe_count || 0,
          recipeCount: cb.recipe_count || 0,
          previewImages: [], // Will be populated from recipes
          is_owner: true,
          owner_id: cb.owner_id,
        })),
        ...(data.saved || []).map((cb: any) => ({
          id: cb.id,
          title: cb.title,
          description: cb.description,
          visibility: cb.visibility,
          recipe_count: cb.recipe_count || 0,
          recipeCount: cb.recipe_count || 0,
          previewImages: [],
          is_owner: false,
          owner_id: cb.owner_id,
          saved_at: cb.saved_at,
        })),
      ];

      // Populate preview images from current recipes state
      const cookbooksWithImages = allCookbooks.map((cb) => {
        const recipeIds = recipes.filter((r) => r.cookbookIds?.includes(cb.id)).map((r) => r.id);
        const previewImages = recipes
          .filter((r) => recipeIds.includes(r.id) && r.thumbnail)
          .slice(0, 4)
          .map((r) => r.thumbnail!);
        return { ...cb, previewImages };
      });

      setCookbooks(cookbooksWithImages);
    } catch (error: any) {
      console.error('Failed to fetch cookbooks:', error);
      setCookbooks([]);
    }
  };

  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([
    {
      id: 'fp1',
      recipe: {
        id: 'r4',
        title: 'Thai Green Curry',
        thumbnail: 'https://images.unsplash.com/photo-1635661988046-306631057df3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb29raW5nJTIwcmVjaXBlJTIwZm9vZHxlbnwxfHx8fDE3NjU5ODIzNzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
        duration: '35 min',
        cuisine: 'Thai',
        cookbookIds: [],
        createdAt: new Date('2024-12-16'),
        description: 'Fragrant Thai curry with coconut milk and vegetables.',
        ingredients: [
          { qty: '3', unit: 'tbsp', item: 'Green curry paste' },
          { qty: '400', unit: 'ml', item: 'Coconut milk' },
          { qty: '500', unit: 'g', item: 'Chicken breast' },
          { qty: '1', unit: 'bunch', item: 'Thai basil' },
        ],
        steps: [
          { text: 'Fry curry paste in a pan until fragrant' },
          { text: 'Add coconut milk and bring to simmer' },
          { text: 'Add chicken and vegetables' },
          { text: 'Cook until chicken is done, add basil' },
        ],
        userId: 'user2',
        author: {
          id: 'user2',
          name: 'Sarah Martinez',
          avatar: 'https://i.pravatar.cc/150?img=5',
        },
        likes: 156,
      },
      isFollowing: false,
      comments: 12,
    },
  ]);

  // Optional: Try to restore session on mount (non-blocking)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getAccessToken();
        if (!token) {
          // Try refresh if no token in memory
          await authAPI.refresh();
        }
        const user = await userAPI.getMe();
        setCurrentUser({
          id: user.id,
          name: user.display_name || user.email?.split('@')[0] || 'User',
          avatar: user.avatar_url || '',
          bio: user.bio || '',
          followers: 0,
          following: 0,
          publicRecipes: 0,
        });
        setIsAuthenticated(true);
      } catch (error) {
        // Silently fail - user will need to login
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    };
    // Only check if we have a potential refresh token cookie
    // For now, skip auto-login on initial load to avoid hanging
    // checkAuth();
  }, []);

  const handleLogin = async () => {
    // Prevent multiple simultaneous login attempts using both state and ref
    if (isLoggingIn || isLoggingInRef.current) {
      console.log('handleLogin: Already processing, skipping', { isLoggingIn, ref: isLoggingInRef.current });
      return;
    }

    setIsLoggingIn(true);
    isLoggingInRef.current = true;
    
    try {
      console.log('handleLogin: Starting...', { hasToken: !!getAccessToken() });
      console.log('handleLogin: Fetching user profile...');
      
      // Retry logic: if profile not found (404), retry a few times
      // This handles race condition where profile creation might still be in progress
      let user;
      let lastError: any = null;
      const maxRetries = 3;
      const retryDelay = 500; // 500ms between retries
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          user = await userAPI.getMe();
          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          // If it's a 404 and we have retries left, wait and retry
          if (error?.message?.includes('not found') && attempt < maxRetries - 1) {
            console.log(`handleLogin: Profile not found, retrying... (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          // Otherwise, throw the error
          throw error;
        }
      }
      
      if (!user) {
        throw lastError || new Error('Failed to fetch user profile');
      }
      
      console.log('handleLogin: User profile fetched', { userId: user.id });
      
      // Note: user service doesn't return email, use display_name or id
      setCurrentUser({
        id: user.id,
        name: user.display_name || `User ${user.id.slice(0, 8)}`,
        avatar: user.avatar_url || '',
        bio: user.bio || '',
        followers: 0,
        following: 0,
        publicRecipes: 0,
      });
      setIsAuthenticated(true);
      console.log('handleLogin: Successfully logged in');
      
      // Fetch recipes and cookbooks after successful login
      await Promise.all([fetchRecipes(), fetchCookbooks()]);
    } catch (error: any) {
      console.error('handleLogin: Failed to get user after login:', error);
      console.error('handleLogin: Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      // Reset auth state on error
      setCurrentUser(null);
      setIsAuthenticated(false);
      // Clear access token if profile fetch fails
      setAccessToken(null);
      // Re-throw so AuthScreen can handle it
      throw new Error(error?.message || 'Failed to load your profile. Please check that the backend is running and try again.');
    } finally {
      setIsLoggingIn(false);
      isLoggingInRef.current = false;
    }
  };

  // Fetch recipes from backend
  const fetchRecipes = async () => {
    try {
      console.log('Fetching recipes from backend...');
      const backendRecipes = await recipeAPI.listRecipes();
      console.log(`Fetched ${backendRecipes.length} recipes from backend`, {
        count: backendRecipes.length,
        firstId: backendRecipes[0]?.id,
        isUUID: backendRecipes[0]?.id?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) !== null,
      });

      // Fetch cookbook membership for each recipe
      const recipesWithCookbooks = await Promise.all(
        backendRecipes.map(async (r: any) => {
          try {
            const cookbookIds = await cookbookAPI.getRecipeCookbooks(r.id);
            return { ...r, cookbookIds };
          } catch (error) {
            // If fetching cookbooks fails, just return empty array
            return { ...r, cookbookIds: [] };
          }
        })
      );

      // Transform backend format to frontend format
      const transformedRecipes: Recipe[] = recipesWithCookbooks.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description || '',
        source_type: r.source_type,
        source_ref: r.source_ref,
        youtubeUrl: r.source_type === 'youtube' ? r.source_ref : undefined,
        cookbookIds: r.cookbookIds || [],
        ingredients: Array.isArray(r.ingredients)
          ? r.ingredients.map((ing: any) => ({
              qty: String(ing.qty),
              unit: String(ing.unit),
              item: String(ing.item),
            }))
          : [],
        steps: Array.isArray(r.steps)
          ? r.steps.map((step: any) => ({
              text: step.text || '',
              timestamp: step.timestamp_sec > 0 ? formatTimestamp(step.timestamp_sec) : undefined,
              timestamp_sec: step.timestamp_sec,
              index: step.index,
            }))
          : [],
        createdAt: new Date(r.created_at),
        userId: r.owner_id,
        owner_id: r.owner_id,
      }));

      setRecipes(transformedRecipes);
    } catch (error: any) {
      console.error('Failed to fetch recipes:', error);
      // Keep empty array on error - user can still use the app
      setRecipes([]);
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: Normalize date fields (convert string to Date if needed)
  const normalizeRecipeDate = (date: Date | string | undefined): Date | undefined => {
    if (!date) return undefined;
    if (date instanceof Date) return date;
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  };

  // Helper: Merge recipe updates, preserving store-only fields
  const mergeRecipeUpdate = (existing: Recipe, patch: Partial<Recipe>): Recipe => {
    // Normalize dates
    const createdAt = patch.createdAt !== undefined 
      ? normalizeRecipeDate(patch.createdAt) || existing.createdAt
      : existing.createdAt;
    const cookedAt = patch.cookedAt !== undefined
      ? normalizeRecipeDate(patch.cookedAt) || existing.cookedAt
      : existing.cookedAt;

    // Merge: existing fields first, then patch fields
    // But preserve store-only fields if patch doesn't provide them
    return {
      ...existing,
      ...patch,
      // Preserve arrays if patch doesn't provide them or provides undefined
      cookbookIds: patch.cookbookIds !== undefined ? patch.cookbookIds : existing.cookbookIds,
      // Preserve dates (already normalized above)
      createdAt,
      cookedAt,
      // Don't overwrite with undefined values
      userId: patch.userId !== undefined ? patch.userId : existing.userId,
      owner_id: patch.owner_id !== undefined ? patch.owner_id : existing.owner_id,
      author: patch.author !== undefined ? patch.author : existing.author,
      likes: patch.likes !== undefined ? patch.likes : existing.likes,
      thumbnail: patch.thumbnail !== undefined ? patch.thumbnail : existing.thumbnail,
      duration: patch.duration !== undefined ? patch.duration : existing.duration,
      cuisine: patch.cuisine !== undefined ? patch.cuisine : existing.cuisine,
    };
  };

  // Update a recipe in the global store (merges updates, preserves store-only fields)
  const updateRecipeInStore = (updatedRecipe: Partial<Recipe> & { id: string }) => {
    setRecipes(prevRecipes => 
      prevRecipes.map(r => {
        if (r.id === updatedRecipe.id) {
          return mergeRecipeUpdate(r, updatedRecipe);
        }
        return r;
      })
    );
  };

  // Fetch recipes when authenticated
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      fetchRecipes();
    }
  }, [isAuthenticated, currentUser?.id]);

  const handleLogout = async () => {
    await authAPI.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setRecipes([]); // Clear recipes on logout
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  const contextValue: AppContextType = {
    isAuthenticated,
    setIsAuthenticated,
    currentUser,
    setCurrentUser,
    recipes,
    setRecipes,
    updateRecipeInStore,
    cookbooks,
    setCookbooks,
    feedPosts,
    setFeedPosts,
    showCreateModal,
    setShowCreateModal,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <AuthScreen onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/*"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : (
              <AuthenticatedLayout>
                <Routes>
                  <Route path="/" element={<MyRecipesRoute />} />
                  <Route path="/cookbooks" element={<CookbooksRoute />} />
                  <Route path="/cookbooks/:id" element={<CookbookDetailRoute />} />
                  <Route path="/feed" element={<FeedRoute />} />
                  <Route path="/profile" element={<ProfileRoute />} />
                  <Route path="/profile/:id" element={<ProfileRoute />} />
                  <Route path="/recipes/:id" element={<RecipeDetailRoute />} />
                  <Route path="/recipes/:id/cook" element={<CookModeRoute />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AuthenticatedLayout>
            )
          }
        />
      </Routes>

      {showCreateModal && (
        <CreateModal
          onClose={() => setShowCreateModal(false)}
          onRecipeCreated={(recipeId) => {
            // Refresh recipe list to include the new one
            // Navigation is handled inside CreateModal
            fetchRecipes();
          }}
        />
      )}
    </AppContext.Provider>
  );
}

export default App;

