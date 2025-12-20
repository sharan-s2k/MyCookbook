# MyCookbook - Frontend Application

A modern React application for managing recipes, cookbooks, and cooking experiences. Turn YouTube videos into cookable recipes with hands-free Cook Mode featuring voice commands and AI assistance.

## 🚀 Features

- **Recipe Management**: Create, view, edit, and delete recipes
- **Cookbook Organization**: Organize recipes into collections
- **Social Feed**: Discover recipes from other users
- **Search**: Find recipes, users, and ingredients
- **Cook Mode**: Hands-free cooking experience with voice commands and AI assistance
- **Recipe Creation**: Generate recipes from YouTube videos or photos
- **User Profiles**: View and manage your profile

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn package manager

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd MyCookbook
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📦 Build for Production

```bash
npm run build
```

The production build will be in the `dist` directory.

## 🗂️ Project Structure

```
MyCookbook/
├── FIGMA UI/
│   ├── components/
│   │   ├── AuthScreen.tsx       # Login/Authentication screen
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── Header.tsx            # Top header bar
│   │   ├── MyRecipes.tsx         # Recipe list view
│   │   ├── Cookbooks.tsx         # Cookbook list view
│   │   ├── Feed.tsx              # Social feed
│   │   ├── SearchScreen.tsx      # Search interface
│   │   ├── Profile.tsx           # User profile
│   │   ├── RecipeDetail.tsx      # Recipe detail view
│   │   ├── CookMode.tsx          # Hands-free cooking mode
│   │   ├── CreateModal.tsx       # Recipe creation modal
│   │   ├── figma/
│   │   │   └── ImageWithFallback.tsx
│   │   └── ui/                    # shadcn/ui components
│   ├── styles/
│   │   └── globals.css           # Global styles and Tailwind config
│   ├── App.tsx                   # Main application component
│   └── main.tsx                  # Application entry point
├── index.html                    # HTML template
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── vite.config.ts               # Vite build configuration
├── tailwind.config.js            # Tailwind CSS configuration
└── postcss.config.js            # PostCSS configuration
```

## 🛣️ Routes and Endpoints

### Authentication Routes

| Route | Path | Component | Description |
|-------|------|-----------|-------------|
| Login | `/login` | `AuthScreen` | Authentication screen (redirects to `/` if already authenticated) |

### Main Application Routes

All routes below require authentication. Unauthenticated users are redirected to `/login`.

| Route | Path | Component | Description |
|-------|------|-----------|-------------|
| Home | `/` | `MyRecipes` | View all user recipes |
| Cookbooks | `/cookbooks` | `Cookbooks` | View all cookbooks |
| Cookbook Detail | `/cookbooks/:id` | `MyRecipes` | View recipes in a specific cookbook |
| Feed | `/feed` | `Feed` | Social feed with recipes from other users |
| Search | `/search` | `SearchScreen` | Search recipes, users, and ingredients |
| Profile | `/profile` | `Profile` | User profile page |
| Recipe Detail | `/recipes/:id` | `RecipeDetail` | View detailed recipe information |
| Cook Mode | `/recipes/:id/cook` | `CookMode` | Hands-free cooking mode for a recipe |

### Route Parameters

- `:id` - Recipe ID or Cookbook ID (string)

## 📡 API Endpoints (Future Backend Integration)

The following endpoints are expected to be implemented in the backend:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Recipes
- `GET /api/recipes` - Get all recipes (with filters)
- `GET /api/recipes/:id` - Get recipe by ID
- `POST /api/recipes` - Create new recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe
- `POST /api/recipes/:id/like` - Like a recipe
- `POST /api/recipes/:id/save` - Save recipe to library

### Cookbooks
- `GET /api/cookbooks` - Get all cookbooks
- `GET /api/cookbooks/:id` - Get cookbook by ID
- `POST /api/cookbooks` - Create new cookbook
- `PUT /api/cookbooks/:id` - Update cookbook
- `DELETE /api/cookbooks/:id` - Delete cookbook
- `POST /api/cookbooks/:id/recipes` - Add recipe to cookbook

### Feed
- `GET /api/feed` - Get feed posts
- `POST /api/feed/posts/:id/like` - Like a feed post
- `POST /api/feed/posts/:id/comment` - Add comment to feed post

### Search
- `GET /api/search?q=:query&type=:type` - Search recipes/users
  - Query parameters:
    - `q` - Search query (string)
    - `type` - Search type: `recipes`, `users`, or `all`

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile
- `POST /api/users/:id/follow` - Follow a user
- `DELETE /api/users/:id/follow` - Unfollow a user

### Recipe Generation
- `POST /api/recipes/generate/youtube` - Generate recipe from YouTube URL
- `POST /api/recipes/generate/photo` - Generate recipe from photo

## 🎨 Component Architecture

### State Management

The application uses React Context API for global state management:

- **AppContext**: Provides global state including:
  - Authentication status
  - Current user
  - Recipes, cookbooks, and feed posts
  - Modal visibility

### Key Components

1. **App.tsx**: Main application component with routing and context
2. **AuthenticatedLayout**: Layout wrapper for authenticated routes
3. **Route Components**: Individual route handlers that use context

## 🎯 Key Features Implementation

### Recipe Creation
- **From YouTube**: Paste YouTube URL to generate recipe
- **From Photo**: Upload photo to extract recipe information
- **Manual Entry**: Edit generated recipes or create from scratch

### Cook Mode
- **Hands-free Navigation**: Voice commands to navigate steps
- **AI Assistant**: Ask questions and get cooking help
- **Timers**: Set multiple timers for different cooking stages
- **Ingredient Checklist**: Track ingredient usage
- **Step Navigation**: Jump between steps easily
- **Serving Scaling**: Adjust ingredient quantities

### Recipe Management
- **Filtering**: Filter by privacy (public/private) and cookbook
- **Sorting**: Sort by date added, date cooked, or alphabetically
- **Privacy Toggle**: Switch between public and private
- **Cookbook Organization**: Move recipes between cookbooks

## 🎨 Styling

The application uses:
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Pre-built component library
- **Lucide React**: Icon library

### Theme Colors
- Primary: Orange (#f97316)
- Background: Neutral grays
- Accent: Orange shades

## 🔧 Development Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## 📝 Type Definitions

### Recipe
```typescript
type Recipe = {
  id: string;
  title: string;
  thumbnail: string;
  isPublic: boolean;
  duration: string;
  cuisine: string;
  cookbookIds: string[];
  createdAt: Date;
  cookedAt?: Date;
  youtubeUrl?: string;
  description: string;
  ingredients: { name: string; amount: string; checked?: boolean }[];
  steps: { text: string; timestamp?: string }[];
  userId: string;
  likes?: number;
  author?: { id: string; name: string; avatar: string };
};
```

### Cookbook
```typescript
type Cookbook = {
  id: string;
  title: string;
  recipeCount: number;
  previewImages: string[];
};
```

### User
```typescript
type User = {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  publicRecipes: number;
};
```

## 🚧 Future Enhancements

- [ ] Backend API integration
- [ ] Real-time notifications
- [ ] Video playback integration
- [ ] Voice command recognition
- [ ] Recipe sharing and collaboration
- [ ] Shopping list generation
- [ ] Meal planning
- [ ] Nutritional information
- [ ] Recipe scaling calculations
- [ ] Multi-language support

## 📄 License

This project uses components from:
- [shadcn/ui](https://ui.shadcn.com/) - MIT License
- [Unsplash](https://unsplash.com) - Unsplash License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues and questions, please open an issue in the repository.

---

Built with ❤️ using React, TypeScript, and Tailwind CSS

