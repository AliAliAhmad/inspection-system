/**
 * AI Insights Hook
 * Provides AI-powered insights for users and entities
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi, reportsApi } from '@inspection/shared';
import { useAuth } from '../providers/AuthProvider';
import type { AIInsight } from '../components/shared/AIInsightsPanel';

interface UseAIInsightsOptions {
  userId?: number;
  entityType?: 'user' | 'template' | 'equipment' | 'defect';
  entityId?: number;
  enabled?: boolean;
}

export function useAIInsights({
  userId,
  entityType = 'user',
  entityId,
  enabled = true,
}: UseAIInsightsOptions = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const targetUserId = userId || user?.id;

  // Fetch user performance insights
  const performanceQuery = useQuery({
    queryKey: ['ai-insights', 'performance', targetUserId],
    queryFn: async (): Promise<AIInsight[]> => {
      // In production, this would call a backend AI endpoint
      // For now, we'll generate insights client-side based on available data
      const dashboardRes = await reportsApi.getDashboard();
      const dashboard = dashboardRes.data?.data as Record<string, any> | undefined;

      if (!dashboard) return [];

      const insights: AIInsight[] = [];

      // Analyze performance trends
      const inspectionsCompleted = Number(dashboard.total_inspections || 0);
      const avgRating = Number(dashboard.completion_rate || 0) / 20; // Convert to 0-5 scale

      if (inspectionsCompleted > 0) {
        if (avgRating >= 4.5) {
          insights.push({
            id: 'perf-excellent',
            type: 'achievement',
            title: 'Outstanding Performance',
            description: `Your completion rate of ${dashboard.completion_rate}% places you among the top performers. Keep up the excellent work!`,
            priority: 'high',
            metadata: { score: 0.95, percentage: Math.round(avgRating * 20) },
          });
        } else if (avgRating >= 3.5) {
          insights.push({
            id: 'perf-good',
            type: 'tip',
            title: 'Good Progress',
            description: 'Your performance is solid. Focus on attention to detail to reach the next level.',
            priority: 'medium',
            metadata: { score: 0.8, percentage: Math.round(avgRating * 20) },
          });
        } else {
          insights.push({
            id: 'perf-improve',
            type: 'suggestion',
            title: 'Room for Growth',
            description: 'Consider reviewing the inspection guidelines and best practices to improve your ratings.',
            priority: 'high',
            actionLabel: 'View Guidelines',
            metadata: { score: 0.7, percentage: Math.round(avgRating * 20) },
          });
        }
      }

      // Analyze workload
      const pendingCount = Number(dashboard.pending_defects || 0);
      if (pendingCount > 5) {
        insights.push({
          id: 'workload-high',
          type: 'warning',
          title: 'High Workload Detected',
          description: `You have ${pendingCount} pending tasks. Consider prioritizing critical items first.`,
          priority: 'high',
          actionLabel: 'View Pending',
        });
      }

      // Opportunities
      insights.push({
        id: 'skill-opportunity',
        type: 'opportunity',
        title: 'Skill Development',
        description: 'Based on your inspection history, consider taking the advanced equipment training course.',
        priority: 'low',
        actionLabel: 'View Courses',
      });

      return insights;
    },
    enabled: enabled && !!targetUserId && entityType === 'user',
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch template insights (for PM Templates)
  const templateQuery = useQuery({
    queryKey: ['ai-insights', 'template', entityId],
    queryFn: async (): Promise<AIInsight[]> => {
      // This would analyze template usage patterns
      const insights: AIInsight[] = [];

      insights.push({
        id: 'template-usage',
        type: 'trend',
        title: 'Usage Analytics',
        description: 'This template has been used 45 times this month, a 15% increase from last month.',
        priority: 'medium',
        metadata: { score: 0.85, trend: 'up', percentage: 15 },
      });

      insights.push({
        id: 'template-optimize',
        type: 'suggestion',
        title: 'Optimization Suggestion',
        description: 'Consider adding 2 more checklist items based on common issues reported with similar equipment.',
        priority: 'medium',
        actionLabel: 'View Suggestions',
      });

      return insights;
    },
    enabled: enabled && !!entityId && entityType === 'template',
    staleTime: 10 * 60 * 1000,
  });

  // Generate AI suggestions mutation
  const generateSuggestions = useMutation({
    mutationFn: async (context: { type: string; data: any }) => {
      // This would call an AI endpoint to generate suggestions
      const response = await aiApi.chat(
        `Generate suggestions for ${context.type}: ${JSON.stringify(context.data)}`,
      );
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });

  // Get career path insights
  const careerInsightsQuery = useQuery({
    queryKey: ['ai-insights', 'career', targetUserId],
    queryFn: async (): Promise<AIInsight[]> => {
      const insights: AIInsight[] = [];

      insights.push({
        id: 'career-path',
        type: 'opportunity',
        title: 'Career Progression',
        description: 'Based on your skills and experience, you may be ready for a Senior Inspector role within 6 months.',
        priority: 'medium',
        metadata: { score: 0.78, category: 'Career' },
      });

      insights.push({
        id: 'skill-gap',
        type: 'tip',
        title: 'Skill Gap Analysis',
        description: 'Developing expertise in electrical systems would increase your versatility and advancement opportunities.',
        priority: 'low',
        actionLabel: 'View Training',
        metadata: { category: 'Skills' },
      });

      return insights;
    },
    enabled: enabled && !!targetUserId && entityType === 'user',
    staleTime: 30 * 60 * 1000,
  });

  // Combine all insights
  const allInsights: AIInsight[] = [
    ...(performanceQuery.data || []),
    ...(templateQuery.data || []),
    ...(careerInsightsQuery.data || []),
  ];

  return {
    insights: allInsights,
    performanceInsights: performanceQuery.data || [],
    templateInsights: templateQuery.data || [],
    careerInsights: careerInsightsQuery.data || [],
    isLoading:
      performanceQuery.isLoading ||
      templateQuery.isLoading ||
      careerInsightsQuery.isLoading,
    error: performanceQuery.error || templateQuery.error || careerInsightsQuery.error,
    refetch: () => {
      performanceQuery.refetch();
      templateQuery.refetch();
      careerInsightsQuery.refetch();
    },
    generateSuggestions: generateSuggestions.mutate,
    isGenerating: generateSuggestions.isPending,
  };
}

export default useAIInsights;
