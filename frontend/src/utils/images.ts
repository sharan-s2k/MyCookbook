// Helper functions for image handling

// Default image paths (imported as static assets)
export const DEFAULT_RECIPE_IMAGE = '/default_recipe.jpg';
export const DEFAULT_PROFILE_IMAGE = '/default_profile.png';

/**
 * Get YouTube thumbnail URL from video ID or URL
 */
export function getYouTubeThumbnailUrl(videoIdOrUrl: string | null | undefined): string | null {
  if (!videoIdOrUrl) return null;
  
  // Extract video ID if URL is provided
  let videoId: string | null = null;
  if (videoIdOrUrl.includes('youtube.com') || videoIdOrUrl.includes('youtu.be')) {
    const match = videoIdOrUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    videoId = match ? match[1] : null;
  } else {
    // Assume it's already a video ID
    videoId = videoIdOrUrl;
  }
  
  if (!videoId) return null;
  
  // Return maxresdefault thumbnail (highest quality)
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Get recipe thumbnail with fallback to default
 */
export function getRecipeThumbnail(thumbnail: string | null | undefined, youtubeUrl?: string | null): string {
  if (thumbnail) return thumbnail;
  
  // Try to get YouTube thumbnail if available
  const ytThumbnail = getYouTubeThumbnailUrl(youtubeUrl || thumbnail);
  if (ytThumbnail) return ytThumbnail;
  
  // Fallback to default
  return DEFAULT_RECIPE_IMAGE;
}

/**
 * Get profile avatar with fallback to default
 */
export function getProfileAvatar(avatar: string | null | undefined): string {
  if (avatar) return avatar;
  return DEFAULT_PROFILE_IMAGE;
}

