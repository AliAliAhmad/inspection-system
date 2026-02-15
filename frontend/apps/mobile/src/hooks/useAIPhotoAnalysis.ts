import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@inspection/shared';

/**
 * AI Photo Analysis Result
 */
export interface AIPhotoAnalysisResult {
  suggestion: 'pass' | 'fail';
  confidence: number;
  reason: string;
  reason_ar?: string;
  analyzed_at: string;
}

/**
 * Inspector Decision for tracking learning
 */
export interface InspectorDecision {
  photoId: string;
  aiSuggestion: 'pass' | 'fail';
  inspectorDecision: 'pass' | 'fail';
  accepted: boolean;
  timestamp: string;
}

interface UseAIPhotoAnalysisOptions {
  /** Whether AI suggestions feature is enabled (admin controlled) */
  enabled?: boolean;
  /** Language for analysis results */
  language?: 'en' | 'ar';
  /** Callback when analysis completes */
  onAnalysisComplete?: (result: AIPhotoAnalysisResult) => void;
  /** Callback when inspector accepts/ignores suggestion */
  onDecision?: (decision: InspectorDecision) => void;
}

interface CachedAnalysis {
  result: AIPhotoAnalysisResult;
  expiresAt: number;
}

/**
 * useAIPhotoAnalysis - Hook for AI-powered photo analysis during inspections
 *
 * Features:
 * - Sends photo to backend for AI analysis
 * - Returns pass/fail suggestion with confidence score
 * - Caches results per photo to avoid duplicate analysis
 * - Tracks inspector decisions for learning
 * - Respects admin feature toggle
 */
export function useAIPhotoAnalysis(options: UseAIPhotoAnalysisOptions = {}) {
  const {
    enabled = true,
    language = 'en',
    onAnalysisComplete,
    onDecision,
  } = options;

  const queryClient = useQueryClient();

  // Cache for photo analysis results (persists for session)
  const cacheRef = useRef<Map<string, CachedAnalysis>>(new Map());
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Current analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<AIPhotoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate a cache key for a photo
   */
  const getCacheKey = useCallback((photoUri: string, checklistItemId?: number): string => {
    // Use a hash of the URI + checklist item ID for caching
    const base = `${photoUri}:${checklistItemId || 'unknown'}`;
    return base;
  }, []);

  /**
   * Check if a cached result exists and is valid
   */
  const getCachedResult = useCallback((cacheKey: string): AIPhotoAnalysisResult | null => {
    const cached = cacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    // Remove expired cache
    if (cached) {
      cacheRef.current.delete(cacheKey);
    }
    return null;
  }, []);

  /**
   * Cache an analysis result
   */
  const cacheResult = useCallback((cacheKey: string, result: AIPhotoAnalysisResult) => {
    cacheRef.current.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL,
    });
  }, []);

  /**
   * Analyze photo mutation
   */
  const analyzeMutation = useMutation({
    mutationFn: async (params: {
      photoUrl: string;
      checklistItemId?: number;
      questionContext?: string;
    }) => {
      const response = await getApiClient().post('/api/ai/analyze-photo', {
        image_url: params.photoUrl,
        checklist_item_id: params.checklistItemId,
        question_context: params.questionContext,
        language,
      });

      const data = (response.data as any)?.data || response.data;
      return data as AIPhotoAnalysisResult;
    },
    onSuccess: (result, variables) => {
      const cacheKey = getCacheKey(variables.photoUrl, variables.checklistItemId);
      cacheResult(cacheKey, result);
      setCurrentResult(result);
      setError(null);
      onAnalysisComplete?.(result);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || err?.message || 'Analysis failed';
      setError(message);
      setCurrentResult(null);
    },
  });

  /**
   * Analyze a photo for pass/fail suggestion
   */
  const analyzePhoto = useCallback(async (
    photoUrl: string,
    checklistItemId?: number,
    questionContext?: string,
  ): Promise<AIPhotoAnalysisResult | null> => {
    // Don't analyze if feature is disabled
    if (!enabled) {
      return null;
    }

    // Check cache first
    const cacheKey = getCacheKey(photoUrl, checklistItemId);
    const cached = getCachedResult(cacheKey);
    if (cached) {
      setCurrentResult(cached);
      onAnalysisComplete?.(cached);
      return cached;
    }

    // Perform analysis
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await analyzeMutation.mutateAsync({
        photoUrl,
        checklistItemId,
        questionContext,
      });
      return result;
    } catch (err) {
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [enabled, getCacheKey, getCachedResult, analyzeMutation, onAnalysisComplete]);

  /**
   * Record inspector decision (accept or ignore AI suggestion)
   * This is used for ML learning to improve future suggestions
   */
  const recordDecision = useCallback(async (
    photoId: string,
    aiSuggestion: 'pass' | 'fail',
    inspectorDecision: 'pass' | 'fail',
  ) => {
    const decision: InspectorDecision = {
      photoId,
      aiSuggestion,
      inspectorDecision,
      accepted: aiSuggestion === inspectorDecision,
      timestamp: new Date().toISOString(),
    };

    onDecision?.(decision);

    // Send to backend for learning (fire and forget)
    try {
      await getApiClient().post('/api/ai/photo-analysis/feedback', {
        photo_id: photoId,
        ai_suggestion: aiSuggestion,
        inspector_decision: inspectorDecision,
        accepted: decision.accepted,
      });
    } catch (err) {
      // Silently fail - this is optional telemetry
      console.warn('Failed to record AI decision feedback:', err);
    }

    return decision;
  }, [onDecision]);

  /**
   * Clear current result
   */
  const clearResult = useCallback(() => {
    setCurrentResult(null);
    setError(null);
  }, []);

  /**
   * Clear all cached results
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    // State
    isAnalyzing,
    result: currentResult,
    error,

    // Actions
    analyzePhoto,
    recordDecision,
    clearResult,
    clearCache,

    // Utility
    isEnabled: enabled,
    getCachedResult,
  };
}

export default useAIPhotoAnalysis;
