export type Recipe = {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  cuisine?: string;
  cookbookIds?: string[];
  createdAt: Date | string;
  cookedAt?: Date;
  youtubeUrl?: string;
  source_ref?: string;
  source_type?: string;
  description: string;
  ingredients: { qty: string; unit: string; item: string }[];
  steps: { text: string; timestamp?: string; timestamp_sec?: number; index?: number }[];
  userId?: string;
  owner_id?: string;
  likes?: number;
  author?: { id: string; name: string; avatar: string };
};

export type Cookbook = {
  id: string;
  title: string;
  description?: string;
  visibility?: 'PRIVATE' | 'PUBLIC';
  recipe_count: number;
  recipeCount: number; // Alias for compatibility
  previewImages: string[];
  is_owner?: boolean;
  owner_id?: string;
  saved_at?: string;
  recipe_ids?: string[];
};

export type User = {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  publicRecipes: number;
};

export type FeedPost = {
  id: string;
  recipe: Recipe;
  isFollowing: boolean;
  comments: number;
};

export type FeedCookbookItem = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  recipe_count: number;
  created_at: string;
  updated_at: string;
  published_at: string;
};

export type FeedResponse = {
  items: FeedCookbookItem[];
  next_cursor: string | null;
};

