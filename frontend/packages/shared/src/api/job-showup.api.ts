import { getApiClient } from './client';
import { ApiResponse } from '../types';

// ============================================
// TYPES
// ============================================

export interface ShowUpPhoto {
  id: number;
  job_type: 'specialist' | 'engineer';
  job_id: number;
  file_id: number;
  file: {
    id: number;
    file_path: string;
    original_filename: string;
    mime_type: string;
  } | null;
  uploaded_by: number;
  uploader_name: string | null;
  created_at: string;
}

export interface ChallengeVoice {
  id: number;
  job_type: 'specialist' | 'engineer';
  job_id: number;
  file_id: number;
  file: {
    id: number;
    file_path: string;
    original_filename: string;
    mime_type: string;
  } | null;
  transcription: string | null;
  transcription_en: string | null;
  transcription_ar: string | null;
  duration_seconds: number | null;
  recorded_by: number;
  recorder_name: string | null;
  created_at: string;
}

export interface ReviewMark {
  id: number;
  job_type: 'specialist' | 'engineer';
  job_id: number;
  mark_type: 'star' | 'point';
  note: string | null;
  marked_by: number;
  marker_name: string | null;
  created_at: string;
}

export interface ShowUpSummary {
  showup_photos: ShowUpPhoto[];
  challenge_voices: ChallengeVoice[];
  review_marks: {
    stars: ReviewMark[];
    points: ReviewMark[];
    star_count: number;
    point_count: number;
  };
  has_showup_photo: boolean;
  has_challenges: boolean;
}

// ============================================
// API
// ============================================

export const jobShowUpApi = {
  // Show-up photo
  uploadShowUpPhoto(jobType: 'specialist' | 'engineer', jobId: number, file: File) {
    const formData = new FormData();
    formData.append('photo', file);
    return getApiClient().post<ApiResponse<ShowUpPhoto>>(
      `/api/job-showup/${jobType}/${jobId}/showup-photo`,
      formData,
      { timeout: 180000 },
    );
  },

  uploadShowUpPhotoBase64(
    jobType: 'specialist' | 'engineer',
    jobId: number,
    base64: string,
    fileName: string = 'showup_photo.jpg',
    fileType: string = 'image/jpeg',
  ) {
    return getApiClient().post<ApiResponse<ShowUpPhoto>>(
      `/api/job-showup/${jobType}/${jobId}/showup-photo`,
      { file_base64: base64, file_name: fileName, file_type: fileType },
      { timeout: 180000 },
    );
  },

  getShowUpPhotos(jobType: 'specialist' | 'engineer', jobId: number) {
    return getApiClient().get<ApiResponse<ShowUpPhoto[]>>(
      `/api/job-showup/${jobType}/${jobId}/showup-photos`,
    );
  },

  // Challenge voice
  uploadChallengeVoice(
    jobType: 'specialist' | 'engineer',
    jobId: number,
    audioFile: File,
    durationSeconds?: number,
  ) {
    const formData = new FormData();
    formData.append('audio', audioFile);
    if (durationSeconds) formData.append('duration_seconds', String(durationSeconds));
    return getApiClient().post<ApiResponse<ChallengeVoice>>(
      `/api/job-showup/${jobType}/${jobId}/challenge-voice`,
      formData,
      { timeout: 180000 },
    );
  },

  uploadChallengeVoiceBase64(
    jobType: 'specialist' | 'engineer',
    jobId: number,
    base64: string,
    fileName: string = 'challenge.m4a',
    fileType: string = 'audio/m4a',
    durationSeconds?: number,
  ) {
    return getApiClient().post<ApiResponse<ChallengeVoice>>(
      `/api/job-showup/${jobType}/${jobId}/challenge-voice`,
      { audio_base64: base64, file_name: fileName, file_type: fileType, duration_seconds: durationSeconds },
      { timeout: 180000 },
    );
  },

  getChallengeVoices(jobType: 'specialist' | 'engineer', jobId: number) {
    return getApiClient().get<ApiResponse<ChallengeVoice[]>>(
      `/api/job-showup/${jobType}/${jobId}/challenge-voices`,
    );
  },

  // Review marks (star / point)
  addReviewMark(
    jobType: 'specialist' | 'engineer',
    jobId: number,
    markType: 'star' | 'point',
    note?: string,
  ) {
    return getApiClient().post<ApiResponse<ReviewMark>>(
      `/api/job-showup/${jobType}/${jobId}/review-mark`,
      { mark_type: markType, note },
    );
  },

  getReviewMarks(jobType: 'specialist' | 'engineer', jobId: number, markType?: 'star' | 'point') {
    const params = markType ? { mark_type: markType } : {};
    return getApiClient().get<ApiResponse<ReviewMark[]>>(
      `/api/job-showup/${jobType}/${jobId}/review-marks`,
      { params },
    );
  },

  removeReviewMark(jobType: 'specialist' | 'engineer', jobId: number, markId: number) {
    return getApiClient().delete<ApiResponse>(
      `/api/job-showup/${jobType}/${jobId}/review-mark/${markId}`,
    );
  },

  // Summary (all data for job detail page)
  getShowUpSummary(jobType: 'specialist' | 'engineer', jobId: number) {
    return getApiClient().get<ApiResponse<ShowUpSummary>>(
      `/api/job-showup/${jobType}/${jobId}/showup-summary`,
    );
  },
};
