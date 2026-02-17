import React, { createContext, useContext, useCallback, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toolkitApi, apiClient } from '@inspection/shared';
import { useAIPhotoAnalysis, AIPhotoAnalysisResult, InspectorDecision } from '../hooks/useAIPhotoAnalysis';

interface AIPhotoAnalysisContextType {
  /** Whether the AI suggestions feature is enabled (admin controlled) */
  isFeatureEnabled: boolean;
  /** Whether AI is currently analyzing a photo */
  isAnalyzing: boolean;
  /** The current analysis result */
  result: AIPhotoAnalysisResult | null;
  /** Error message if analysis failed */
  error: string | null;
  /** Analyze a photo for pass/fail suggestion */
  analyzePhoto: (photoUrl: string, checklistItemId?: number, questionContext?: string) => Promise<AIPhotoAnalysisResult | null>;
  /** Record inspector decision (accept/ignore) for ML learning */
  recordDecision: (photoId: string, aiSuggestion: 'pass' | 'fail', inspectorDecision: 'pass' | 'fail') => Promise<InspectorDecision>;
  /** Clear current result */
  clearResult: () => void;
  /** Whether settings are still loading */
  isLoadingSettings: boolean;
}

const AIPhotoAnalysisContext = createContext<AIPhotoAnalysisContextType | null>(null);

interface AIPhotoAnalysisProviderProps {
  children: ReactNode;
  /** Override feature enabled state (useful for testing) */
  forceEnabled?: boolean;
  /** Language for analysis results */
  language?: 'en' | 'ar';
}

/**
 * AIPhotoAnalysisProvider - Context provider for AI photo analysis during inspections
 *
 * Features:
 * - Checks admin settings to determine if feature is enabled
 * - Provides AI analysis hook functionality to child components
 * - Tracks inspector decisions for ML improvement
 */
export function AIPhotoAnalysisProvider({
  children,
  forceEnabled,
  language = 'en',
}: AIPhotoAnalysisProviderProps) {
  const [isFeatureEnabled, setIsFeatureEnabled] = useState(forceEnabled ?? false);

  // Fetch user toolkit preferences to check if AI suggestions are enabled
  // Only run when API client is initialized (prevents race condition with AuthProvider)
  const {
    data: preferences,
    isLoading: isLoadingSettings,
  } = useQuery({
    queryKey: ['toolkitPreferences'],
    queryFn: async () => {
      try {
        const response = await toolkitApi.getPreferences();
        return (response.data as any)?.data || response.data;
      } catch (err) {
        console.warn('Failed to load toolkit preferences:', err);
        return null;
      }
    },
    enabled: !!apiClient, // Wait until API client is initialized by AuthProvider
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Update feature enabled state based on preferences
  useEffect(() => {
    if (forceEnabled !== undefined) {
      setIsFeatureEnabled(forceEnabled);
    } else if (preferences) {
      // Check if ai_suggestions_enabled is set in preferences
      setIsFeatureEnabled(preferences.ai_suggestions_enabled ?? true);
    }
  }, [preferences, forceEnabled]);

  // Use the AI photo analysis hook
  const {
    isAnalyzing,
    result,
    error,
    analyzePhoto: analyzePhotoFn,
    recordDecision: recordDecisionFn,
    clearResult,
  } = useAIPhotoAnalysis({
    enabled: isFeatureEnabled,
    language,
  });

  // Wrap analyzePhoto to check feature enabled
  const analyzePhoto = useCallback(async (
    photoUrl: string,
    checklistItemId?: number,
    questionContext?: string,
  ): Promise<AIPhotoAnalysisResult | null> => {
    if (!isFeatureEnabled) {
      return null;
    }
    return analyzePhotoFn(photoUrl, checklistItemId, questionContext);
  }, [isFeatureEnabled, analyzePhotoFn]);

  // Wrap recordDecision
  const recordDecision = useCallback(async (
    photoId: string,
    aiSuggestion: 'pass' | 'fail',
    inspectorDecision: 'pass' | 'fail',
  ): Promise<InspectorDecision> => {
    return recordDecisionFn(photoId, aiSuggestion, inspectorDecision);
  }, [recordDecisionFn]);

  const value: AIPhotoAnalysisContextType = {
    isFeatureEnabled,
    isAnalyzing,
    result,
    error,
    analyzePhoto,
    recordDecision,
    clearResult,
    isLoadingSettings,
  };

  return (
    <AIPhotoAnalysisContext.Provider value={value}>
      {children}
    </AIPhotoAnalysisContext.Provider>
  );
}

/**
 * useAIPhotoAnalysisContext - Hook to access AI photo analysis context
 */
export function useAIPhotoAnalysisContext(): AIPhotoAnalysisContextType {
  const context = useContext(AIPhotoAnalysisContext);
  if (!context) {
    throw new Error('useAIPhotoAnalysisContext must be used within an AIPhotoAnalysisProvider');
  }
  return context;
}

/**
 * useOptionalAIPhotoAnalysis - Hook that returns null if not within provider
 * Useful for components that may or may not have access to AI analysis
 */
export function useOptionalAIPhotoAnalysis(): AIPhotoAnalysisContextType | null {
  return useContext(AIPhotoAnalysisContext);
}

export default AIPhotoAnalysisProvider;
