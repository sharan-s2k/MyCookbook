import React, { useState, createContext, useContext } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { AuthScreen } from './components/features/AuthScreen';
import { Sidebar } from './components/features/Sidebar';
import { Header } from './components/features/Header';
import { MyRecipes } from './components/features/MyRecipes';
import { Cookbooks } from './components/features/Cookbooks';
import { Feed } from './components/features/Feed';
import { SearchScreen } from './components/features/SearchScreen';
import { Profile } from './components/features/Profile';
import { RecipeDetail } from './components/features/RecipeDetail';
import { CookMode } from './components/features/CookMode';
import { CreateModal } from './components/modals/CreateModal';
import type { Recipe, Cookbook, User, FeedPost } from './types';

type AppContextType = {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  currentUser: User;
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
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
    else if (screen === 'search') navigate('/search');
    else if (screen === 'profile') navigate('/profile');
  };

  const handleLogout = () => {
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
        currentUser={currentUser}
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
              currentUser={currentUser}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          currentScreen={getCurrentScreen()}
          onOpenCreate={() => setShowCreateModal(true)}
          currentUser={currentUser}
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
  const { recipes, cookbooks, setRecipes, setCookbooks } = useAppContext();

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleUpdateRecipe = (updatedRecipe: Recipe) => {
    setRecipes(recipes.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
  };

  const handleMoveToCookbook = (recipeId: string, cookbookId: string | null) => {
    setRecipes(recipes.map(r => {
      if (r.id === recipeId) {
        const newCookbookIds = cookbookId 
          ? [...r.cookbookIds.filter(id => id !== cookbookId), cookbookId]
          : r.cookbookIds.filter(id => !cookbooks.find(cb => cb.id === id));
        return { ...r, cookbookIds: cookbookId ? [cookbookId] : newCookbookIds };
      }
      return r;
    }));
    
    // Update cookbook recipe counts
    if (cookbookId) {
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        setCookbooks(cookbooks.map(cb => {
          if (cb.id === cookbookId && !recipe.cookbookIds.includes(cookbookId)) {
            return { ...cb, recipeCount: cb.recipeCount + 1, previewImages: [...cb.previewImages.slice(0, 3), recipe.thumbnail] };
          }
          if (recipe.cookbookIds.includes(cb.id) && cb.id !== cookbookId) {
            return { ...cb, recipeCount: Math.max(0, cb.recipeCount - 1), previewImages: cb.previewImages.filter(img => img !== recipe.thumbnail) };
          }
          return cb;
        }));
      }
    }
  };

  const handleTogglePrivacy = (recipeId: string) => {
    setRecipes(recipes.map(r => 
      r.id === recipeId ? { ...r, isPublic: !r.isPublic } : r
    ));
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
          setCookbooks(cookbooks.map(cb => ({
            ...cb,
            recipeCount: cb.recipeCount - (recipe.cookbookIds.includes(cb.id) ? 1 : 0),
            previewImages: cb.previewImages.filter(img => img !== recipe.thumbnail)
          })));
        }
        setRecipes(recipes.filter(r => r.id !== id));
      }}
      onUpdateRecipe={handleUpdateRecipe}
      onMoveToCookbook={handleMoveToCookbook}
      onTogglePrivacy={handleTogglePrivacy}
    />
  );
}

function CookbooksRoute() {
  const navigate = useNavigate();
  const { cookbooks, setCookbooks, recipes, setRecipes } = useAppContext();

  const handleViewCookbook = (cookbook: Cookbook) => {
    navigate(`/cookbooks/${cookbook.id}`);
  };

  const handleCreateCookbook = (title: string) => {
    const newCookbook: Cookbook = {
      id: `cb${Date.now()}`,
      title,
      recipeCount: 0,
      previewImages: [],
    };
    setCookbooks([...cookbooks, newCookbook]);
  };

  const handleRenameCookbook = (id: string, newTitle: string) => {
    setCookbooks(cookbooks.map(cb => 
      cb.id === id ? { ...cb, title: newTitle } : cb
    ));
  };

  const handleDeleteCookbook = (id: string) => {
    // Remove cookbook from recipes
    setRecipes(recipes.map(r => ({
      ...r,
      cookbookIds: r.cookbookIds.filter(cbId => cbId !== id)
    })));
    setCookbooks(cookbooks.filter(c => c.id !== id));
  };

  return (
    <Cookbooks
      cookbooks={cookbooks}
      onViewCookbook={handleViewCookbook}
      onDeleteCookbook={handleDeleteCookbook}
      onCreateCookbook={handleCreateCookbook}
      onRenameCookbook={handleRenameCookbook}
    />
  );
}

function CookbookDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes, cookbooks, setRecipes, setCookbooks } = useAppContext();

  const cookbook = cookbooks.find(cb => cb.id === id);
  if (!cookbook) return <div className="p-8">Cookbook not found</div>;

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleUpdateRecipe = (updatedRecipe: Recipe) => {
    setRecipes(recipes.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
  };

  const handleMoveToCookbook = (recipeId: string, cookbookId: string | null) => {
    setRecipes(recipes.map(r => {
      if (r.id === recipeId) {
        return { ...r, cookbookIds: cookbookId ? [cookbookId] : r.cookbookIds.filter(id => id !== cookbook.id) };
      }
      return r;
    }));
    
    if (cookbookId && cookbookId !== cookbook.id) {
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        setCookbooks(cookbooks.map(cb => {
          if (cb.id === cookbookId && !recipe.cookbookIds.includes(cookbookId)) {
            return { ...cb, recipeCount: cb.recipeCount + 1, previewImages: [...cb.previewImages.slice(0, 3), recipe.thumbnail] };
          }
          if (cb.id === cookbook.id && recipe.cookbookIds.includes(cookbook.id)) {
            return { ...cb, recipeCount: Math.max(0, cb.recipeCount - 1), previewImages: cb.previewImages.filter(img => img !== recipe.thumbnail) };
          }
          return cb;
        }));
      }
    }
  };

  const handleTogglePrivacy = (recipeId: string) => {
    setRecipes(recipes.map(r => 
      r.id === recipeId ? { ...r, isPublic: !r.isPublic } : r
    ));
  };

  return (
    <MyRecipes
      recipes={recipes.filter(r => r.cookbookIds.includes(cookbook.id))}
      cookbooks={cookbooks}
      onViewRecipe={handleViewRecipe}
      onStartCook={handleStartCook}
      onDeleteRecipe={(id) => {
        const recipe = recipes.find(r => r.id === id);
        if (recipe) {
          setCookbooks(cookbooks.map(cb => ({
            ...cb,
            recipeCount: cb.recipeCount - (recipe.cookbookIds.includes(cb.id) ? 1 : 0),
            previewImages: cb.previewImages.filter(img => img !== recipe.thumbnail)
          })));
        }
        setRecipes(recipes.filter(r => r.id !== id));
      }}
      onUpdateRecipe={handleUpdateRecipe}
      onMoveToCookbook={handleMoveToCookbook}
      onTogglePrivacy={handleTogglePrivacy}
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

function SearchRoute() {
  const navigate = useNavigate();
  const { recipes } = useAppContext();

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  return (
    <SearchScreen
      recipes={recipes}
      onViewRecipe={handleViewRecipe}
      onStartCook={handleStartCook}
    />
  );
}

function ProfileRoute() {
  const navigate = useNavigate();
  const { currentUser, recipes } = useAppContext();

  const handleViewRecipe = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}`);
  };

  const handleStartCook = (recipe: Recipe) => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  return (
    <Profile
      user={currentUser}
      recipes={recipes.filter(r => r.userId === currentUser.id)}
      onViewRecipe={handleViewRecipe}
      onStartCook={handleStartCook}
    />
  );
}

function RecipeDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes, cookbooks, setRecipes, setCookbooks } = useAppContext();

  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return <div className="p-8">Recipe not found</div>;

  const handleStartCookMode = () => {
    navigate(`/recipes/${recipe.id}/cook`);
  };

  const handleUpdateRecipe = (updatedRecipe: Recipe) => {
    setRecipes(recipes.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
  };

  const handleSaveToCookbook = (recipeId: string, cookbookId: string | null) => {
    setRecipes(recipes.map(r => {
      if (r.id === recipeId) {
        const newCookbookIds = cookbookId 
          ? [...r.cookbookIds.filter(id => id !== cookbookId), cookbookId]
          : r.cookbookIds;
        return { ...r, cookbookIds: cookbookId ? [...new Set([...r.cookbookIds, cookbookId])] : r.cookbookIds };
      }
      return r;
    }));
    
    if (cookbookId) {
      setCookbooks(cookbooks.map(cb => {
        if (cb.id === cookbookId && !recipe.cookbookIds.includes(cookbookId)) {
          return { ...cb, recipeCount: cb.recipeCount + 1, previewImages: [...cb.previewImages.slice(0, 3), recipe.thumbnail] };
        }
        return cb;
      }));
    }
  };

  const handleTogglePrivacy = (recipeId: string) => {
    setRecipes(recipes.map(r => 
      r.id === recipeId ? { ...r, isPublic: !r.isPublic } : r
    ));
  };

  return (
    <RecipeDetail
      recipe={recipe}
      onStartCookMode={handleStartCookMode}
      onBack={() => navigate('/')}
      onUpdateRecipe={handleUpdateRecipe}
      onSaveToCookbook={handleSaveToCookbook}
      onTogglePrivacy={handleTogglePrivacy}
      cookbooks={cookbooks}
    />
  );
}

function CookModeRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes } = useAppContext();

  const recipe = recipes.find(r => r.id === id);
  if (!recipe) return <div>Recipe not found</div>;

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
  const [currentUser] = useState<User>({
    id: 'user1',
    name: 'Alex Chen',
    avatar: 'https://images.unsplash.com/photo-1759521296144-fe6f2d2dc769?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGVmJTIwcG9ydHJhaXQlMjBwcm9mZXNzaW9uYWx8ZW58MXx8fHwxNzY1OTgzMDE1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    bio: 'Home cook & recipe enthusiast',
    followers: 243,
    following: 89,
    publicRecipes: 12,
  });

  const [recipes, setRecipes] = useState<Recipe[]>([
    {
      id: 'r1',
      title: 'Classic Carbonara',
      thumbnail: 'https://images.unsplash.com/photo-1739417083034-4e9118f487be?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYXN0YSUyMGRpc2glMjBpdGFsaWFufGVufDF8fHx8MTc2NjAwNjYyNnww&ixlib=rb-4.1.0&q=80&w=1080',
      isPublic: true,
      duration: '25 min',
      cuisine: 'Italian',
      cookbookIds: ['cb1'],
      createdAt: new Date('2024-12-10'),
      cookedAt: new Date('2024-12-15'),
      youtubeUrl: 'https://youtube.com/watch?v=example',
      description: 'Authentic Italian carbonara with guanciale and pecorino romano.',
      ingredients: [
        { name: 'Spaghetti', amount: '400g' },
        { name: 'Guanciale', amount: '200g' },
        { name: 'Egg yolks', amount: '4' },
        { name: 'Pecorino Romano', amount: '100g' },
        { name: 'Black pepper', amount: '2 tsp' },
      ],
      steps: [
        { text: 'Bring a large pot of salted water to boil', timestamp: '0:15' },
        { text: 'Cut guanciale into small cubes and render in a pan', timestamp: '1:30' },
        { text: 'Whisk egg yolks with grated pecorino and black pepper', timestamp: '3:00' },
        { text: 'Cook spaghetti until al dente', timestamp: '4:20' },
        { text: 'Toss pasta with guanciale, remove from heat, add egg mixture', timestamp: '6:45' },
      ],
      userId: 'user1',
      likes: 42,
    },
    {
      id: 'r2',
      title: 'Mediterranean Quinoa Bowl',
      thumbnail: 'https://images.unsplash.com/photo-1624340209404-4f479dd59708?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwc2FsYWQlMjBib3dsfGVufDF8fHx8MTc2NjAzMjI4OXww&ixlib=rb-4.1.0&q=80&w=1080',
      isPublic: false,
      duration: '30 min',
      cuisine: 'Mediterranean',
      cookbookIds: ['cb2'],
      createdAt: new Date('2024-12-12'),
      description: 'Healthy grain bowl with roasted vegetables and tahini dressing.',
      ingredients: [
        { name: 'Quinoa', amount: '1 cup' },
        { name: 'Cherry tomatoes', amount: '200g' },
        { name: 'Cucumber', amount: '1' },
        { name: 'Chickpeas', amount: '1 can' },
        { name: 'Tahini', amount: '3 tbsp' },
      ],
      steps: [
        { text: 'Cook quinoa according to package instructions' },
        { text: 'Roast chickpeas with olive oil and spices at 400°F for 20 minutes' },
        { text: 'Chop vegetables into bite-sized pieces' },
        { text: 'Make tahini dressing with lemon juice and garlic' },
        { text: 'Assemble bowl and drizzle with dressing' },
      ],
      userId: 'user1',
    },
    {
      id: 'r3',
      title: 'Chocolate Lava Cake',
      thumbnail: 'https://images.unsplash.com/photo-1607257882338-70f7dd2ae344?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNzZXJ0JTIwY2hvY29sYXRlJTIwY2FrZXxlbnwxfHx8fDE3NjU5NTQxNTl8MA&ixlib=rb-4.1.0&q=80&w=1080',
      isPublic: true,
      duration: '20 min',
      cuisine: 'French',
      cookbookIds: ['cb1'],
      createdAt: new Date('2024-12-08'),
      description: 'Decadent molten chocolate cake with a gooey center.',
      ingredients: [
        { name: 'Dark chocolate', amount: '200g' },
        { name: 'Butter', amount: '100g' },
        { name: 'Eggs', amount: '3' },
        { name: 'Sugar', amount: '75g' },
        { name: 'Flour', amount: '50g' },
      ],
      steps: [
        { text: 'Melt chocolate and butter together' },
        { text: 'Whisk eggs and sugar until pale and fluffy' },
        { text: 'Fold in melted chocolate and flour' },
        { text: 'Pour into greased ramekins' },
        { text: 'Bake at 425°F for 12 minutes' },
      ],
      userId: 'user1',
      likes: 89,
    },
  ]);

  const [cookbooks, setCookbooks] = useState<Cookbook[]>([
    {
      id: 'cb1',
      title: 'Weeknight Dinners',
      recipeCount: 2,
      previewImages: [
        'https://images.unsplash.com/photo-1739417083034-4e9118f487be?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYXN0YSUyMGRpc2glMjBpdGFsaWFufGVufDF8fHx8MTc2NjAwNjYyNnww&ixlib=rb-4.1.0&q=80&w=1080',
        'https://images.unsplash.com/photo-1607257882338-70f7dd2ae344?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNzZXJ0JTIwY2hvY29sYXRlJTIwY2FrZXxlbnwxfHx8fDE3NjU5NTQxNTl8MA&ixlib=rb-4.1.0&q=80&w=1080',
      ],
    },
    {
      id: 'cb2',
      title: 'Healthy Bowls',
      recipeCount: 1,
      previewImages: [
        'https://images.unsplash.com/photo-1624340209404-4f479dd59708?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwc2FsYWQlMjBib3dsfGVufDF8fHx8MTc2NjAzMjI4OXww&ixlib=rb-4.1.0&q=80&w=1080',
      ],
    },
  ]);

  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([
    {
      id: 'fp1',
      recipe: {
        id: 'r4',
        title: 'Thai Green Curry',
        thumbnail: 'https://images.unsplash.com/photo-1635661988046-306631057df3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb29raW5nJTIwcmVjaXBlJTIwZm9vZHxlbnwxfHx8fDE3NjU5ODIzNzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
        isPublic: true,
        duration: '35 min',
        cuisine: 'Thai',
        cookbookIds: [],
        createdAt: new Date('2024-12-16'),
        description: 'Fragrant Thai curry with coconut milk and vegetables.',
        ingredients: [
          { name: 'Green curry paste', amount: '3 tbsp' },
          { name: 'Coconut milk', amount: '400ml' },
          { name: 'Chicken breast', amount: '500g' },
          { name: 'Thai basil', amount: '1 bunch' },
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

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const contextValue: AppContextType = {
    isAuthenticated,
    setIsAuthenticated,
    currentUser,
    recipes,
    setRecipes,
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
                  <Route path="/search" element={<SearchRoute />} />
                  <Route path="/profile" element={<ProfileRoute />} />
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
          onSave={(recipe) => {
            setRecipes([...recipes, recipe]);
            setShowCreateModal(false);
          }}
        />
      )}
    </AppContext.Provider>
  );
}

export default App;

