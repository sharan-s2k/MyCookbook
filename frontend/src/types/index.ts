export type Recipe = {
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

