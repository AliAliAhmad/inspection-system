import { getApiClient } from './client';
import { ApiResponse } from '../types';

// ============================================
// TYPES
// ============================================

export interface DefectAnalysis {
  description: string;
  location: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  cause: string;
  recommendation: string;
  safety_risk: string;
  success: boolean;
}

export interface GaugeReading {
  value: number;
  unit: string;
  min: number;
  max: number;
  status: 'normal' | 'warning' | 'danger';
  success: boolean;
}

export interface ImageComparison {
  changes: string[];
  condition_change: 'improved' | 'worsened' | 'same';
  work_done: string;
  remaining_issues: string[];
  success: boolean;
}

export interface ReportResult {
  report: string;
  success: boolean;
}

export interface SummaryResult {
  summary: string;
  success: boolean;
}

export interface TranslationResult {
  translation: string;
  success: boolean;
}

export interface SearchResult {
  query: string;
  results: Array<{
    similarity: number;
    [key: string]: any;
  }>;
  count: number;
}

export interface AssistantResponse {
  response: string;
  thread_id: string;
  success: boolean;
}

// ============================================
// API
// ============================================

export const aiApi = {
  // -------- VISION --------

  /** Analyze a defect photo using GPT-4 Vision */
  analyzeDefect(imageUrl: string, language: string = 'en') {
    return getApiClient().post<ApiResponse<DefectAnalysis>>('/api/ai/vision/analyze-defect', {
      image_url: imageUrl,
      language,
    });
  },

  /** Read gauge/meter values from an image */
  readGauge(imageUrl: string) {
    return getApiClient().post<ApiResponse<GaugeReading>>('/api/ai/vision/read-gauge', {
      image_url: imageUrl,
    });
  },

  /** Compare before/after images */
  compareImages(beforeUrl: string, afterUrl: string, language: string = 'en') {
    return getApiClient().post<ApiResponse<ImageComparison>>('/api/ai/vision/compare', {
      before_url: beforeUrl,
      after_url: afterUrl,
      language,
    });
  },

  // -------- REPORTS --------

  /** Generate an inspection report */
  generateReport(inspectionData: any, language: string = 'en') {
    return getApiClient().post<ApiResponse<ReportResult>>('/api/ai/reports/generate', {
      inspection_data: inspectionData,
      language,
    });
  },

  /** Summarize multiple defects */
  summarizeDefects(defects: any[], language: string = 'en') {
    return getApiClient().post<ApiResponse<SummaryResult>>('/api/ai/reports/summarize-defects', {
      defects,
      language,
    });
  },

  /** Translate text between English and Arabic */
  translate(text: string, targetLanguage: 'en' | 'ar') {
    return getApiClient().post<ApiResponse<TranslationResult>>('/api/ai/reports/translate', {
      text,
      target_language: targetLanguage,
    });
  },

  // -------- SEARCH --------

  /** Find similar defects using semantic search (fetches from DB) */
  searchSimilarDefects(query: string, topK: number = 10) {
    return getApiClient().post<ApiResponse<SearchResult>>('/api/ai/search/similar-defects', {
      query,
      top_k: topK,
    });
  },

  /** Create an embedding vector for text */
  createEmbedding(text: string) {
    return getApiClient().post<ApiResponse<{ embedding: number[]; dimensions: number }>>('/api/ai/search/create-embedding', {
      text,
    });
  },

  // -------- TEXT-TO-SPEECH --------

  /** Convert text to speech audio (returns blob) */
  async textToSpeech(text: string, voice: string = 'nova'): Promise<Blob> {
    const response = await getApiClient().post('/api/ai/tts/speak', { text, voice }, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  /** Generate audio for a checklist question (returns blob) */
  async readChecklistItem(question: string, language: string = 'en'): Promise<Blob> {
    const response = await getApiClient().post('/api/ai/tts/checklist-item', { question, language }, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  /** List available TTS voices */
  listVoices() {
    return getApiClient().get<ApiResponse<{ voices: string[]; default: string }>>('/api/ai/tts/voices');
  },

  // -------- ASSISTANT --------

  /** Chat with the AI assistant */
  chat(message: string, threadId?: string) {
    return getApiClient().post<ApiResponse<AssistantResponse>>('/api/ai/assistant/chat', {
      message,
      thread_id: threadId,
    });
  },

  // -------- DAILY REVIEW AI (convenience re-exports) --------

  /** Get AI-suggested ratings for a daily review */
  suggestRatings(reviewId: number) {
    return getApiClient().get<ApiResponse<any>>(`/api/work-plan-tracking/${reviewId}/ai/suggest-ratings`);
  },

  // -------- DEFECT AI --------

  /** Analyze defect risk score */
  analyzeDefectRisk(defectId: number) {
    return getApiClient().get<ApiResponse<{ risk_score: number; factors: string[] }>>(
      `/api/defects/${defectId}/ai/risk-analysis`
    );
  },
};
