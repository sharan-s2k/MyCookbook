import React, { useState, useEffect } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import type { FeedCookbookItem, FeedResponse, User } from '../../types';
import { feedAPI, userAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

interface FeedProps {
  currentUser: User;
}

export function Feed({ currentUser }: FeedProps) {
  const navigate = useNavigate();
  const [feedItems, setFeedItems] = useState<FeedCookbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userCache, setUserCache] = useState<Map<string, { name: string; avatar: string }>>(new Map());

  // Fetch user info for a given owner_id
  const fetchUserInfo = async (ownerId: string) => {
    if (userCache.has(ownerId)) {
      return userCache.get(ownerId)!;
    }

    try {
      const user = await userAPI.getUserById(ownerId);
      const userInfo = {
        name: user.display_name || user.username || `User ${ownerId.slice(0, 8)}`,
        avatar: user.avatar_url || '/default_profile.png',
      };
      setUserCache(prev => new Map(prev).set(ownerId, userInfo));
      return userInfo;
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      return {
        name: `User ${ownerId.slice(0, 8)}`,
        avatar: '/default_profile.png',
      };
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Load initial feed
  const loadFeed = async (cursor?: string | null, append: boolean = false) => {
    try {
      if (!append) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const response: FeedResponse = await feedAPI.getHomeFeed(cursor, 20);

      if (append) {
        setFeedItems(prev => [...prev, ...response.items]);
      } else {
        setFeedItems(response.items);
      }

      setNextCursor(response.next_cursor);

      // Fetch user info for all items (in parallel, but don't block)
      response.items.forEach(item => {
        if (!userCache.has(item.owner_id)) {
          fetchUserInfo(item.owner_id);
        }
      });
    } catch (err: any) {
      console.error('Failed to load feed:', err);
      setError(err.message || 'Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      loadFeed(nextCursor, true);
    }
  };

  const handleVisitCookbook = (cookbookId: string) => {
    navigate(`/cookbooks/${cookbookId}`);
  };

  const handleViewProfile = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="text-gray-600">Loading feed...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error loading feed</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={() => loadFeed()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Your feed is empty</h3>
            <p className="text-gray-600 mb-4">
              Start following users to see their public cookbooks here.
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              Explore Cookbooks
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="space-y-6">
          {feedItems.map((item) => {
            const userInfo = userCache.get(item.owner_id) || {
              name: `User ${item.owner_id.slice(0, 8)}`,
              avatar: '/default_profile.png',
            };

            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Post header */}
                <div className="p-4 border-b border-gray-100">
                  <div
                    onClick={() => handleViewProfile(item.owner_id)}
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <img
                      src={userInfo.avatar}
                      alt={userInfo.name}
                      className="w-10 h-10 rounded-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/default_profile.png';
                      }}
                    />
                    <div className="flex-1">
                      <div className="text-gray-900 font-medium">{userInfo.name}</div>
                      <div className="text-xs text-gray-500">
                        published a cookbook • {formatRelativeTime(item.published_at)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cookbook content */}
                <div className="p-4">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                  {item.description && (
                    <p className="text-gray-600 text-sm mb-3 line-clamp-3">
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-4 h-4" />
                      {item.recipe_count} recipe{item.recipe_count !== 1 ? 's' : ''}
                    </span>
                    <span>•</span>
                    <span>{formatRelativeTime(item.created_at)}</span>
                  </div>

                  {/* Visit Cookbook button */}
                  <button
                    onClick={() => handleVisitCookbook(item.id)}
                    className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Visit Cookbook
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Load More button */}
        {nextCursor && (
          <div className="mt-8 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className={`px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg transition-colors ${
                loadingMore ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}