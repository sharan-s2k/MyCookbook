import React, { useState } from 'react';
import { Edit, Globe, Lock, BookOpen, UserPlus, UserMinus } from 'lucide-react';
import type { User, Cookbook } from '../../types';
import { EditProfileModal } from '../modals/EditProfileModal';
import { FollowersFollowingModal } from '../modals/FollowersFollowingModal';
import { userAPI } from '../../api/client';

interface ProfileProps {
  user: User;
  cookbooks: Cookbook[];
  onViewCookbook: (cookbook: Cookbook) => void;
  onUpdateUser: (updates: { display_name?: string; bio?: string; avatar_url?: string }) => Promise<void>;
  isOwnProfile?: boolean;
  isFollowing?: boolean;
  onFollow?: () => void;
  followersCount?: number;
  followingCount?: number;
}

export function Profile({ 
  user, 
  cookbooks, 
  onViewCookbook, 
  onUpdateUser,
  isOwnProfile = true,
  isFollowing = false,
  onFollow,
  followersCount,
  followingCount,
}: ProfileProps) {
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);

  const publicCookbooks = cookbooks.filter(cb => cb.visibility === 'PUBLIC');
  const privateCookbooks = cookbooks.filter(cb => cb.visibility === 'PRIVATE');

  // When viewing other users, only show public cookbooks
  const displayCookbooks = isOwnProfile 
    ? (activeTab === 'public' ? publicCookbooks : privateCookbooks)
    : publicCookbooks;

  const displayFollowersCount = followersCount !== undefined ? followersCount : user.followers;
  const displayFollowingCount = followingCount !== undefined ? followingCount : user.following;

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Profile header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-6">
            <img
              src={user.avatar || '/default_profile.png'}
              alt={user.name}
              className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/default_profile.png';
              }}
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-gray-900">{user.name}</h1>
                {isOwnProfile ? (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit profile
                  </button>
                ) : (
                  onFollow && (
                    <button
                      onClick={onFollow}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        isFollowing
                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                          : 'bg-orange-500 hover:bg-orange-600 text-white'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserMinus className="w-4 h-4" />
                          Unfollow
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Follow
                        </>
                      )}
                    </button>
                  )
                )}
              </div>
              <p className="text-gray-600 mb-4">{user.bio}</p>
              <div className="flex items-center gap-6 text-sm">
                <button
                  onClick={() => setShowFollowersModal(true)}
                  className="px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <span className="text-gray-900 group-hover:text-orange-600 transition-colors font-medium">{displayFollowersCount}</span>
                  <span className="text-gray-500 ml-1 group-hover:text-orange-500 transition-colors">Followers</span>
                </button>
                <button
                  onClick={() => setShowFollowingModal(true)}
                  className="px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <span className="text-gray-900 group-hover:text-orange-600 transition-colors font-medium">{displayFollowingCount}</span>
                  <span className="text-gray-500 ml-1 group-hover:text-orange-500 transition-colors">Following</span>
                </button>
                <div className="px-2 py-1">
                  <span className="text-gray-900 font-medium">{cookbooks.length}</span>
                  <span className="text-gray-500 ml-1">Cookbooks</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs - Only show for own profile */}
        {isOwnProfile && (
          <div className="flex gap-6 border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('public')}
              className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'public'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Globe className="w-4 h-4" />
              Public ({publicCookbooks.length})
            </button>
            <button
              onClick={() => setActiveTab('private')}
              className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'private'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Lock className="w-4 h-4" />
              Private ({privateCookbooks.length})
            </button>
          </div>
        )}

        {/* Cookbook grid */}
        {displayCookbooks.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {isOwnProfile 
                ? `No ${activeTab} cookbooks yet`
                : 'No public cookbooks yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {displayCookbooks.map((cookbook) => (
              <div
                key={cookbook.id}
                className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow group cursor-pointer"
                onClick={() => onViewCookbook(cookbook)}
              >
                {/* Preview grid */}
                <div className="aspect-square grid grid-cols-2 gap-1 p-1 bg-gray-100">
                  {cookbook.previewImages.slice(0, 4).map((img, idx) => (
                    <div key={idx} className="bg-gray-200 rounded overflow-hidden">
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-300" />
                      )}
                    </div>
                  ))}
                  {cookbook.previewImages.length === 0 && (
                    <>
                      <div className="bg-gray-300" />
                      <div className="bg-gray-300" />
                      <div className="bg-gray-300" />
                      <div className="bg-gray-300" />
                    </>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="text-gray-900 font-medium mb-1 line-clamp-2">{cookbook.title}</h3>
                  <p className="text-sm text-gray-500">{cookbook.recipeCount || 0} recipes</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEditModal && (
        <EditProfileModal
          user={user}
          onClose={() => setShowEditModal(false)}
          onSave={onUpdateUser}
        />
      )}

      {showFollowersModal && (
        <FollowersFollowingModal
          userId={user.id}
          type="followers"
          onClose={() => setShowFollowersModal(false)}
        />
      )}

      {showFollowingModal && (
        <FollowersFollowingModal
          userId={user.id}
          type="following"
          onClose={() => setShowFollowingModal(false)}
        />
      )}
    </div>
  );
}
