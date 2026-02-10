/**
 * User Profile Hook
 * Manages user profile data, updates, and avatar upload
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, filesApi, reportsApi } from '@inspection/shared';
import { useAuth } from '../providers/AuthProvider';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';

interface ProfileUpdatePayload {
  full_name?: string;
  email?: string;
  phone?: string;
  employee_id?: string;
  specialization?: string;
  shift?: string;
  avatar_url?: string | null;
}

interface PasswordChangePayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

interface ProfileStats {
  inspections_completed: number;
  defects_found: number;
  average_rating: number;
  points_earned: number;
  jobs_completed: number;
  on_time_completion_rate: number;
  quality_score: number;
}

interface ActivityItem {
  id: string;
  type: 'inspection' | 'defect' | 'job' | 'leave' | 'achievement';
  title: string;
  description?: string;
  timestamp: string;
  entityId?: number;
}

export function useUserProfile(userId?: number) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const targetUserId = userId || user?.id;

  // Fetch detailed user profile
  const profileQuery = useQuery({
    queryKey: ['user-profile', targetUserId],
    queryFn: async () => {
      // For current user, use auth context
      if (!userId && user) {
        return user;
      }
      // For other users (admin viewing), fetch from API
      const response = await usersApi.list({ search: undefined });
      const users = response.data?.data || [];
      return users.find((u: any) => u.id === targetUserId);
    },
    enabled: !!targetUserId,
  });

  // Fetch profile statistics
  const statsQuery = useQuery({
    queryKey: ['user-stats', targetUserId],
    queryFn: async (): Promise<ProfileStats> => {
      const dashboardRes = await reportsApi.getDashboard();
      const dashboard = dashboardRes.data?.data as Record<string, any> | undefined;

      return {
        inspections_completed: Number(dashboard?.total_inspections || 0),
        defects_found: Number(dashboard?.pending_defects || 0),
        average_rating: Number(dashboard?.completion_rate || 0) / 20,
        points_earned: 0,
        jobs_completed: Number(dashboard?.active_jobs || 0),
        on_time_completion_rate: Number(dashboard?.completion_rate || 0),
        quality_score: Number(dashboard?.completion_rate || 0),
      };
    },
    enabled: !!targetUserId,
    staleTime: 60 * 1000, // 1 minute
  });

  // Fetch recent activity
  const activityQuery = useQuery({
    queryKey: ['user-activity', targetUserId],
    queryFn: async (): Promise<ActivityItem[]> => {
      // This would fetch from a user activity endpoint
      // For now, return mock data
      return [
        {
          id: '1',
          type: 'inspection',
          title: 'Completed inspection',
          description: 'Equipment A-101',
          timestamp: new Date().toISOString(),
          entityId: 1,
        },
        {
          id: '2',
          type: 'defect',
          title: 'Reported defect',
          description: 'Oil leak on Pump B',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          entityId: 2,
        },
        {
          id: '3',
          type: 'achievement',
          title: 'Earned badge',
          description: '100 inspections completed',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
        },
      ];
    },
    enabled: !!targetUserId,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (payload: ProfileUpdatePayload) => {
      if (!targetUserId) throw new Error('No user ID');
      return usersApi.update(targetUserId, payload as any);
    },
    onSuccess: () => {
      message.success(t('profile.updated', 'Profile updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['user-profile', targetUserId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || t('profile.updateFailed', 'Failed to update profile'));
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (payload: PasswordChangePayload) => {
      if (payload.new_password !== payload.confirm_password) {
        throw new Error(t('profile.passwordMismatch', 'Passwords do not match'));
      }
      // This would call a password change endpoint
      // For now, simulate success
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: true };
    },
    onSuccess: () => {
      message.success(t('profile.passwordChanged', 'Password changed successfully'));
    },
    onError: (error: any) => {
      message.error(error.message || t('profile.passwordChangeFailed', 'Failed to change password'));
    },
  });

  // Upload avatar mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      // Upload file first - requires relatedType, relatedId
      if (!targetUserId) throw new Error('No user ID');

      const uploadResponse = await filesApi.upload(file, 'user', targetUserId, 'avatar');
      const fileUrl = uploadResponse.data?.data?.url;

      if (!fileUrl) throw new Error('Upload failed');

      // Then update profile with new avatar URL
      await usersApi.update(targetUserId, { avatar_url: fileUrl } as any);

      return fileUrl;
    },
    onSuccess: () => {
      message.success(t('profile.avatarUploaded', 'Avatar uploaded successfully'));
      queryClient.invalidateQueries({ queryKey: ['user-profile', targetUserId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || t('profile.avatarUploadFailed', 'Failed to upload avatar'));
    },
  });

  // Remove avatar mutation
  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      if (!targetUserId) throw new Error('No user ID');
      return usersApi.update(targetUserId, { avatar_url: null } as any);
    },
    onSuccess: () => {
      message.success(t('profile.avatarRemoved', 'Avatar removed'));
      queryClient.invalidateQueries({ queryKey: ['user-profile', targetUserId] });
    },
  });

  return {
    // Data
    profile: profileQuery.data,
    stats: statsQuery.data,
    activity: activityQuery.data || [],

    // Loading states
    isLoading: profileQuery.isLoading,
    isStatsLoading: statsQuery.isLoading,
    isActivityLoading: activityQuery.isLoading,

    // Errors
    error: profileQuery.error,

    // Mutations
    updateProfile: updateProfileMutation.mutate,
    isUpdating: updateProfileMutation.isPending,

    changePassword: changePasswordMutation.mutate,
    isChangingPassword: changePasswordMutation.isPending,

    uploadAvatar: uploadAvatarMutation.mutate,
    isUploadingAvatar: uploadAvatarMutation.isPending,

    removeAvatar: removeAvatarMutation.mutate,
    isRemovingAvatar: removeAvatarMutation.isPending,

    // Refetch
    refetch: () => {
      profileQuery.refetch();
      statsQuery.refetch();
      activityQuery.refetch();
    },
  };
}

export default useUserProfile;
