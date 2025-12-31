export type Recipe = {
  id: string;
  title: string;
  thumbnail?: string;
  isPublic: boolean;
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
  recipeCount: number;
  previewImages: string[];
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

