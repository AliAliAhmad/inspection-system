import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Equipment,
  CreateEquipmentPayload,
  ImportLog,
  ImportResult,
  EquipmentKPIs,
  EquipmentAlert,
  EquipmentTrend,
  RiskScore,
  EquipmentWatch,
  WatchPreferences,
  EquipmentNote,
  CreateNotePayload,
  EquipmentCertification,
  CreateCertificationPayload,
  EquipmentCosts,
  CostConfigPayload,
  EquipmentLeaderboardEntry,
  AchievementsData,
  EquipmentStreak,
  ExportOptions,
} from '../types';

export interface EquipmentListParams extends PaginationParams {
  status?: string;
  equipment_type?: string;
  search?: string;
}

export const equipmentApi = {
  list(params?: EquipmentListParams) {
    return getApiClient().get<PaginatedResponse<Equipment>>('/api/equipment', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<Equipment>>(`/api/equipment/${id}`);
  },

  create(payload: CreateEquipmentPayload) {
    return getApiClient().post<ApiResponse<Equipment>>('/api/equipment', payload);
  },

  update(id: number, payload: Partial<CreateEquipmentPayload>) {
    return getApiClient().put<ApiResponse<Equipment>>(`/api/equipment/${id}`, payload);
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/equipment/${id}`);
  },

  getTypes() {
    return getApiClient().get<ApiResponse<string[]>>('/api/equipment/types');
  },

  // Import endpoints - accepts File (web) or { uri, type, name } (React Native)
  import(file: File | { uri: string; type: string; name: string }) {
    const formData = new FormData();
    formData.append('file', file as any);
    return getApiClient().post<ApiResponse<ImportResult>>('/api/equipment/import', formData);
  },

  downloadTemplate() {
    return getApiClient().get('/api/equipment/template', { responseType: 'blob' });
  },

  getImportHistory() {
    return getApiClient().get<ApiResponse<ImportLog[]>>('/api/equipment/import-history');
  },

  // Dashboard endpoints
  getDashboard(params?: { status_color?: string; berth?: string }) {
    return getApiClient().get<ApiResponse<any>>('/api/equipment/dashboard', { params });
  },

  getDetails(id: number) {
    return getApiClient().get<ApiResponse<any>>(`/api/equipment/${id}/details`);
  },

  updateStatus(id: number, payload: { status: string; reason: string; next_action: string }) {
    return getApiClient().put<ApiResponse<Equipment>>(`/api/equipment/${id}/status`, payload);
  },

  getStatusHistory(id: number) {
    return getApiClient().get<ApiResponse<any[]>>(`/api/equipment/${id}/status-history`);
  },

  // KPI and Analytics endpoints
  getKPIs() {
    return getApiClient().get<ApiResponse<EquipmentKPIs>>('/api/equipment/kpis');
  },

  getTrends(period: '7d' | '30d' = '7d') {
    return getApiClient().get<ApiResponse<EquipmentTrend>>('/api/equipment/trends', { params: { period } });
  },

  getAlerts(params?: { severity?: string; is_read?: boolean; limit?: number }) {
    return getApiClient().get<ApiResponse<EquipmentAlert[]>>('/api/equipment/alerts', { params });
  },

  acknowledgeAlert(alertId: number) {
    return getApiClient().put<ApiResponse<EquipmentAlert>>(`/api/equipment/alerts/${alertId}/acknowledge`);
  },

  dismissAlert(alertId: number) {
    return getApiClient().put<ApiResponse<EquipmentAlert>>(`/api/equipment/alerts/${alertId}/dismiss`);
  },

  getRiskScore(equipmentId: number) {
    return getApiClient().get<ApiResponse<RiskScore>>(`/api/equipment/${equipmentId}/risk-score`);
  },

  bulkUpdateStatus(ids: number[], status: string, reason: string, next_action?: string) {
    return getApiClient().put<ApiResponse<Equipment[]>>('/api/equipment/bulk-status', {
      ids,
      status,
      reason,
      next_action,
    });
  },

  exportEquipment(ids?: number[], format: 'csv' | 'xlsx' = 'csv') {
    return getApiClient().get('/api/equipment/export', {
      params: { ids: ids?.join(','), format },
      responseType: 'blob',
    });
  },

  // ============================================
  // AI-POWERED ENDPOINTS
  // ============================================

  /** Get AI-calculated risk score for equipment */
  getAIRiskScore(equipmentId: number) {
    return getApiClient().get<ApiResponse<AIRiskScore>>(`/api/equipment/${equipmentId}/ai/risk-score`);
  },

  /** Get AI failure prediction for equipment */
  getAIFailurePrediction(equipmentId: number) {
    return getApiClient().get<ApiResponse<AIFailurePrediction>>(`/api/equipment/${equipmentId}/ai/predict-failure`);
  },

  /** Detect anomalies for specific equipment */
  getAIAnomalies(equipmentId: number) {
    return getApiClient().get<ApiResponse<AIAnomalyResult>>(`/api/equipment/${equipmentId}/ai/anomalies`);
  },

  /** Find similar equipment */
  getAISimilarEquipment(equipmentId: number) {
    return getApiClient().get<ApiResponse<AISimilarEquipmentResult>>(`/api/equipment/${equipmentId}/ai/similar`);
  },

  /** Get AI-generated summary of equipment */
  getAISummary(equipmentId: number) {
    return getApiClient().get<ApiResponse<AIEquipmentSummary>>(`/api/equipment/${equipmentId}/ai/summary`);
  },

  /** Get AI-powered recommendations for equipment */
  getAIRecommendations(equipmentId: number) {
    return getApiClient().get<ApiResponse<AIRecommendation[]>>(`/api/equipment/${equipmentId}/ai/recommendations`);
  },

  /** Ask AI assistant about equipment */
  askAIAssistant(equipmentId: number, question: string) {
    return getApiClient().post<ApiResponse<AIAssistantResponse>>(`/api/equipment/${equipmentId}/ai/ask`, {
      question,
    });
  },

  /** Search equipment using natural language */
  searchNatural(query: string) {
    return getApiClient().post<ApiResponse<AINaturalSearchResult>>('/api/equipment/ai/search', {
      query,
    });
  },

  /** Get failure patterns analysis */
  getAIFailurePatterns(equipmentType?: string) {
    return getApiClient().get<ApiResponse<AIFailurePatterns>>('/api/equipment/ai/failure-patterns', {
      params: equipmentType ? { equipment_type: equipmentType } : undefined,
    });
  },

  /** Get fleet-wide health summary */
  getAIFleetHealth() {
    return getApiClient().get<ApiResponse<AIFleetHealth>>('/api/equipment/ai/fleet-health');
  },

  /** Get all detected anomalies across equipment */
  getAIAllAnomalies() {
    return getApiClient().get<ApiResponse<AIAllAnomaliesResult>>('/api/equipment/ai/anomalies');
  },

  // ============================================
  // COST CALCULATOR ENDPOINTS
  // ============================================

  /** Get equipment costs including downtime and trends */
  getCosts(equipmentId: number) {
    return getApiClient().get<ApiResponse<EquipmentCosts>>(`/api/equipment/${equipmentId}/costs`);
  },

  /** Configure cost settings for equipment */
  configureCosts(equipmentId: number, payload: CostConfigPayload) {
    return getApiClient().put<ApiResponse<Equipment>>(`/api/equipment/${equipmentId}/costs/configure`, payload);
  },

  // ============================================
  // WATCH/SUBSCRIBE ENDPOINTS
  // ============================================

  /** Subscribe to equipment notifications */
  watch(equipmentId: number, preferences?: WatchPreferences) {
    return getApiClient().post<ApiResponse<EquipmentWatch>>(`/api/equipment/${equipmentId}/watch`, preferences);
  },

  /** Unsubscribe from equipment notifications */
  unwatch(equipmentId: number) {
    return getApiClient().delete<ApiResponse>(`/api/equipment/${equipmentId}/watch`);
  },

  /** Check if current user is watching equipment */
  getWatchStatus(equipmentId: number) {
    return getApiClient().get<ApiResponse<{ is_watching: boolean; watch: EquipmentWatch | null }>>(`/api/equipment/${equipmentId}/watch/status`);
  },

  /** Get list of users watching equipment */
  getWatchers(equipmentId: number) {
    return getApiClient().get<ApiResponse<EquipmentWatch[]>>(`/api/equipment/${equipmentId}/watchers`);
  },

  // ============================================
  // EQUIPMENT NOTES ENDPOINTS
  // ============================================

  /** Get notes for equipment */
  getNotes(equipmentId: number) {
    return getApiClient().get<ApiResponse<EquipmentNote[]>>(`/api/equipment/${equipmentId}/notes`);
  },

  /** Add a note to equipment */
  addNote(equipmentId: number, payload: CreateNotePayload) {
    return getApiClient().post<ApiResponse<EquipmentNote>>(`/api/equipment/${equipmentId}/notes`, payload);
  },

  /** Update a note */
  updateNote(equipmentId: number, noteId: number, payload: Partial<CreateNotePayload>) {
    return getApiClient().put<ApiResponse<EquipmentNote>>(`/api/equipment/${equipmentId}/notes/${noteId}`, payload);
  },

  /** Delete a note */
  deleteNote(equipmentId: number, noteId: number) {
    return getApiClient().delete<ApiResponse>(`/api/equipment/${equipmentId}/notes/${noteId}`);
  },

  // ============================================
  // CERTIFICATION ENDPOINTS
  // ============================================

  /** Get certifications for equipment */
  getCertifications(equipmentId: number) {
    return getApiClient().get<ApiResponse<EquipmentCertification[]>>(`/api/equipment/${equipmentId}/certifications`);
  },

  /** Add a certification to equipment */
  addCertification(equipmentId: number, payload: CreateCertificationPayload) {
    return getApiClient().post<ApiResponse<EquipmentCertification>>(`/api/equipment/${equipmentId}/certifications`, payload);
  },

  /** Update a certification */
  updateCertification(equipmentId: number, certId: number, payload: Partial<CreateCertificationPayload & { status?: string }>) {
    return getApiClient().put<ApiResponse<EquipmentCertification>>(`/api/equipment/${equipmentId}/certifications/${certId}`, payload);
  },

  /** Delete a certification */
  deleteCertification(equipmentId: number, certId: number) {
    return getApiClient().delete<ApiResponse>(`/api/equipment/${equipmentId}/certifications/${certId}`);
  },

  /** Get certifications expiring within N days */
  getExpiringCertifications(days: number = 30) {
    return getApiClient().get<ApiResponse<EquipmentCertification[]>>('/api/equipment/certifications/expiring', { params: { days } });
  },

  // ============================================
  // GAMIFICATION ENDPOINTS
  // ============================================

  /** Get technician performance leaderboard */
  getLeaderboard(params?: { period?: 'week' | 'month' | 'all_time'; berth?: string }) {
    return getApiClient().get<ApiResponse<EquipmentLeaderboardEntry[]>>('/api/equipment/gamification/leaderboard', { params });
  },

  /** Get achievements and user progress */
  getAchievements() {
    return getApiClient().get<ApiResponse<AchievementsData>>('/api/equipment/gamification/achievements');
  },

  /** Get equipment uptime streaks */
  getStreaks() {
    return getApiClient().get<ApiResponse<EquipmentStreak[]>>('/api/equipment/gamification/streaks');
  },

  // ============================================
  // EXPORT ENDPOINTS
  // ============================================

  /** Export equipment data to Excel or PDF */
  exportData(options: ExportOptions) {
    return getApiClient().post('/api/equipment/export', options, { responseType: 'blob' });
  },

  /** Generate detailed PDF report for single equipment */
  generateReport(equipmentId: number) {
    return getApiClient().get(`/api/equipment/${equipmentId}/report`, { responseType: 'blob' });
  },
};

// ============================================
// AI TYPES
// ============================================

export interface AIRiskScore {
  equipment_id: number;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  criticality_level: string;
  criticality_multiplier: number;
  raw_score: number;
  factors: {
    [key: string]: {
      value: number | string;
      score: number;
      weight: number;
      weighted_score: number;
    };
  };
  recommendations: string[];
  calculated_at: string;
}

export interface AIFailurePrediction {
  equipment_id: number;
  failure_probability: {
    '30_days': number;
    '60_days': number;
    '90_days': number;
  };
  mtbf_days: number;
  days_since_last_failure: number;
  historical_failures: number;
  recommended_maintenance_date: string;
  maintenance_urgency: 'urgent' | 'high' | 'medium' | 'low';
  estimated_remaining_life_years: number;
  age_years: number;
  age_factor: number;
  current_status: string;
  calculated_at: string;
}

export interface AIAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  value: number;
  [key: string]: any;
}

export interface AIAnomalyResult {
  equipment_id: number;
  anomaly_count: number;
  anomalies: AIAnomaly[];
  max_severity: string;
  total_severity_score: number;
  status: 'anomalies_detected' | 'normal';
  analyzed_at: string;
}

export interface AISimilarEquipment {
  equipment_id: number;
  name: string;
  name_ar: string | null;
  serial_number: string;
  status: string;
  berth: string | null;
  installation_date: string | null;
  manufacturer: string | null;
  similarity_score: number;
  recent_defects: number;
  has_warning: boolean;
  warning_message: string | null;
  last_risk_score: number | null;
}

export interface AISimilarEquipmentResult {
  reference_equipment_id: number;
  reference_equipment_name: string;
  reference_equipment_type: string;
  reference_status: string;
  reference_status_warning: string | null;
  similar_equipment: AISimilarEquipment[];
  total_similar: number;
  with_warnings: number;
  found_at: string;
}

export interface AIEquipmentSummary {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  serial_number: string;
  current_status: string;
  criticality_level: string;
  health_score: number;
  risk_score: number;
  risk_level: string;
  uptime_percentage_90_days: number;
  inspection_summary: {
    total: number;
    passed: number;
    failed: number;
    last_inspection_date: string | null;
  };
  defect_summary: {
    total: number;
    by_severity: { [key: string]: number };
    open_count: number;
  };
  status_history: {
    old_status: string;
    new_status: string;
    reason: string;
    date: string;
  }[];
  failure_prediction: {
    '30_day_probability': number;
    recommended_maintenance: string | null;
    maintenance_urgency: string;
  };
  anomaly_status: string;
  anomaly_count: number;
  recommendations: string[];
  generated_at: string;
}

export interface AIRecommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  action?: string;
  anomaly_type?: string;
  related_equipment_id?: number;
}

export interface AIAssistantResponse {
  answer: string;
  sources: string[];
  confidence: number;
}

export interface AINaturalSearchResult {
  parsed_query: {
    original_query: string;
    filters: { [key: string]: any };
    sort: { field?: string; order?: string };
    understood: boolean;
    parsed_at: string;
  };
  results: Equipment[];
  count: number;
}

export interface AIFailurePatterns {
  equipment_type: string;
  total_equipment: number;
  total_defects: number;
  defects_per_equipment: number;
  severity_distribution: { [key: string]: number };
  category_distribution: { [key: string]: number };
  monthly_trend: { [key: string]: number };
  high_risk_equipment: { equipment_id: number; defect_count: number }[];
  patterns: {
    type: string;
    [key: string]: any;
  }[];
  analyzed_at: string;
}

export interface AIFleetHealth {
  total_equipment: number;
  by_status: { [key: string]: number };
  by_risk: { low: number; medium: number; high: number; critical: number };
  average_risk_score: number;
  fleet_health: 'excellent' | 'good' | 'fair' | 'poor';
  high_risk_equipment: {
    equipment_id: number;
    equipment_name: string;
    equipment_type: string;
    risk_score: number;
    risk_level: string;
    status: string;
  }[];
  calculated_at: string;
}

export interface AIAllAnomaliesResult {
  anomalies: (AIAnomaly & { equipment_id: number; equipment_name: string })[];
  count: number;
  by_severity: { critical: number; high: number; medium: number; low: number };
}
