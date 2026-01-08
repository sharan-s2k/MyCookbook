import React, { useState, useEffect } from 'react';
import { X, User } from 'lucide-react';
import { userAPI } from '../../api/client';

interface FollowersFollowingModalProps {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
}

interface UserListItem {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

export function FollowersFollowingModal({ userId, type, onClose }: FollowersFollowingModalProps) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = type === 'followers'
          ? await userAPI.getFollowers(userId)
          : await userAPI.getFollowing(userId);
        setUsers(Array.isArray(data) ? data : (data.users || []));
      } catch (err: any) {
        setError(err?.message || `Failed to load ${type}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [userId, type]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 capitalize">{type}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No {type} yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <img
                    src={user.avatar_url || '/default_profile.png'}
                    alt={user.display_name || user.username}
                    className="w-10 h-10 rounded-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/default_profile.png';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user.display_name || user.username}
                    </div>
                    {user.display_name && (
                      <div className="text-xs text-gray-500 truncate">@{user.username}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

