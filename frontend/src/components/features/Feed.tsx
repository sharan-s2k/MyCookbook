import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, ChefHat, Save, UserPlus, UserCheck } from 'lucide-react';
import type { FeedPost, Recipe } from '../../types';

interface FeedProps {
  posts: FeedPost[];
  onViewRecipe: (recipe: Recipe) => void;
  onStartCook: (recipe: Recipe) => void;
  onSaveRecipe: (recipe: Recipe) => void;
}

export function Feed({ posts, onViewRecipe, onStartCook, onSaveRecipe }: FeedProps) {
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  const handleFollow = (userId: string) => {
    setFollowingIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleLike = (postId: string) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleSave = (recipe: Recipe) => {
    setSavedIds(prev => new Set(prev).add(recipe.id));
    onSaveRecipe(recipe);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const suggestedUsers = [
    { id: 'u1', name: 'Jamie Oliver', avatar: 'https://i.pravatar.cc/150?img=12', followers: '2.4M' },
    { id: 'u2', name: 'Gordon Ramsay', avatar: 'https://i.pravatar.cc/150?img=13', followers: '1.8M' },
    { id: 'u3', name: 'Ina Garten', avatar: 'https://i.pravatar.cc/150?img=14', followers: '985K' },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_300px] gap-8">
          {/* Feed posts */}
          <div className="space-y-6">
            {posts.map((post) => {
              const isFollowing = followingIds.has(post.recipe.author?.id || '');
              const isLiked = likedIds.has(post.id);
              const isSaved = savedIds.has(post.recipe.id);

              return (
                <div key={post.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Post header */}
                  <div className="p-4 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <img
                        src={post.recipe.author?.avatar}
                        alt={post.recipe.author?.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-gray-900">{post.recipe.author?.name}</div>
                        <div className="text-xs text-gray-500">2 hours ago</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleFollow(post.recipe.author?.id || '')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        isFollowing
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-4 h-4" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Follow
                        </>
                      )}
                    </button>
                  </div>

                  {/* Recipe preview */}
                  <div
                    onClick={() => onViewRecipe(post.recipe)}
                    className="cursor-pointer"
                  >
                    <img
                      src={post.recipe.thumbnail}
                      alt={post.recipe.title}
                      className="w-full aspect-video object-cover"
                    />
                    <div className="p-4">
                      <h3 className="text-gray-900 mb-2">{post.recipe.title}</h3>
                      <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                        {post.recipe.description}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>{post.recipe.duration}</span>
                        <span>•</span>
                        <span>{post.recipe.cuisine}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 flex items-center gap-3">
                    <button
                      onClick={() => !isSaved && handleSave(post.recipe)}
                      disabled={isSaved}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        isSaved
                          ? 'bg-green-50 text-green-600 cursor-not-allowed'
                          : 'border border-orange-500 text-orange-500 hover:bg-orange-50'
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      {isSaved ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={() => onStartCook(post.recipe)}
                      className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <ChefHat className="w-4 h-4" />
                      Cook
                    </button>
                  </div>

                  {/* Interactions */}
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-6">
                    <button
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-2 transition-colors ${
                        isLiked ? 'text-red-500' : 'text-gray-600 hover:text-red-500'
                      }`}
                    >
                      <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                      <span className="text-sm">{(post.recipe.likes || 0) + (isLiked ? 1 : 0)}</span>
                    </button>
                    <button
                      onClick={() => setCommentOpen(commentOpen === post.id ? null : post.id)}
                      className="flex items-center gap-2 text-gray-600 hover:text-orange-500 transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span className="text-sm">{post.comments}</span>
                    </button>
                    <button className="flex items-center gap-2 text-gray-600 hover:text-orange-500 transition-colors">
                      <Share2 className="w-5 h-5" />
                      <span className="text-sm">Share</span>
                    </button>
                  </div>

                  {/* Comments section */}
                  {commentOpen === post.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                      <div className="flex gap-3">
                        <img
                          src="https://i.pravatar.cc/150?img=1"
                          alt="You"
                          className="w-8 h-8 rounded-full"
                        />
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="flex gap-3">
                          <img
                            src="https://i.pravatar.cc/150?img=3"
                            alt="User"
                            className="w-8 h-8 rounded-full"
                          />
                          <div>
                            <div className="text-sm">
                              <span className="text-gray-900">John Doe</span>
                              <span className="text-gray-500 ml-2">This looks amazing!</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">2h ago</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Suggested users sidebar */}
          <div className="hidden lg:block">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-8">
              <h3 className="text-gray-900 mb-4">People you may like</h3>
              <div className="space-y-3">
                {suggestedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-sm text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.followers} followers</div>
                      </div>
                    </div>
                    <button className="text-sm text-orange-500 hover:text-orange-600">
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save toast */}
      {saveToast && (
        <div className="fixed bottom-8 right-8 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <Save className="w-5 h-5" />
          <span>Recipe saved to your library</span>
          <button className="text-orange-400 hover:text-orange-300 ml-2">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
