# Frontend Structure

This document describes the organization of the frontend codebase.

## Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── features/          # Main application features
│   │   │   ├── AuthScreen.tsx      # Authentication/login screen
│   │   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   │   ├── Header.tsx          # Application header with search
│   │   │   ├── MyRecipes.tsx       # Recipe list view
│   │   │   ├── Cookbooks.tsx       # Cookbook list view
│   │   │   ├── Feed.tsx            # Social feed
│   │   │   ├── SearchScreen.tsx    # Search interface
│   │   │   ├── Profile.tsx         # User profile
│   │   │   ├── RecipeDetail.tsx   # Recipe detail view
│   │   │   └── CookMode.tsx        # Hands-free cooking mode
│   │   ├── modals/            # Modal dialogs
│   │   │   ├── CreateModal.tsx          # Create new recipe modal
│   │   │   ├── EditRecipeModal.tsx      # Edit recipe modal
│   │   │   └── CookbookSelectModal.tsx   # Select cookbook modal
│   │   ├── ui/                # shadcn/ui components
│   │   │   └── [40+ UI components]
│   │   └── shared/            # Shared utility components
│   │       └── ImageWithFallback.tsx    # Image with error fallback
│   ├── types/
│   │   └── index.ts           # TypeScript type definitions
│   ├── styles/
│   │   └── globals.css        # Global styles and CSS variables
│   ├── App.tsx                # Main application component with routing
│   └── main.tsx               # Application entry point
├── public/                    # Static assets
├── index.html                 # HTML template
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite build configuration
├── tailwind.config.js         # Tailwind CSS configuration
├── postcss.config.js          # PostCSS configuration
├── .gitignore                 # Git ignore rules
├── README.md                  # Project documentation
└── STRUCTURE.md               # This file
```

## Component Organization

### Features (`src/components/features/`)
Main application screens and features. These are the primary views users interact with.

### Modals (`src/components/modals/`)
Reusable modal dialogs for creating, editing, and selecting data.

### UI Components (`src/components/ui/`)
Pre-built UI components from shadcn/ui library. These are reusable, accessible components.

### Shared Components (`src/components/shared/`)
Utility components used across multiple features.

## Type Definitions

All TypeScript types are centralized in `src/types/index.ts`:
- `Recipe` - Recipe data structure
- `Cookbook` - Cookbook data structure  
- `User` - User data structure
- `FeedPost` - Feed post data structure

## Import Patterns

### Importing Types
```typescript
import type { Recipe, Cookbook } from '../../types';
```

### Importing Features
```typescript
import { MyRecipes } from './components/features/MyRecipes';
```

### Importing Modals
```typescript
import { CreateModal } from './components/modals/CreateModal';
```

### Importing UI Components
```typescript
import { Button } from './components/ui/button';
```

### Importing Shared Components
```typescript
import { ImageWithFallback } from './components/shared/ImageWithFallback';
```

## Routing

Routes are defined in `src/App.tsx`:
- `/login` - Authentication
- `/` - Home (My Recipes)
- `/cookbooks` - Cookbooks list
- `/cookbooks/:id` - Cookbook detail
- `/feed` - Social feed
- `/search` - Search
- `/profile` - User profile
- `/recipes/:id` - Recipe detail
- `/recipes/:id/cook` - Cook mode

## State Management

Global state is managed via React Context API in `App.tsx`:
- Authentication state
- User data
- Recipes
- Cookbooks
- Feed posts
- Modal visibility

## Styling

- **Tailwind CSS**: Utility-first CSS framework
- **CSS Variables**: Defined in `globals.css` for theming
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints

## Build Configuration

- **Vite**: Build tool and dev server
- **TypeScript**: Type checking and compilation
- **PostCSS**: CSS processing
- **Tailwind**: CSS framework compilation

## Development Workflow

1. Components are organized by feature/type
2. Types are centralized for consistency
3. Shared utilities are in dedicated folders
4. UI components are from shadcn/ui library
5. All imports use relative paths from `src/`

