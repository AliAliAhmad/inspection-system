export type EquipmentStatus = 'active' | 'under_maintenance' | 'out_of_service' | 'stopped' | 'paused';

export interface Equipment {
  id: number;
  name: string;
  name_ar: string | null;
  equipment_type: string;
  equipment_type_ar: string | null;
  serial_number: string;
  location: string;
  location_en: string;
  location_ar: string | null;
  berth: string | null;
  home_berth: string | null;
  status: EquipmentStatus;
  assigned_technician_id: number | null;
  assigned_technician: import('./user.types').User | null;
  manufacturer: string | null;
  model_number: string | null;
  installation_date: string | null;
  created_at: string;
}

export interface CreateEquipmentPayload {
  name: string;
  equipment_type: string;
  serial_number: string;
  location: string;
  location_ar?: string;
  status?: EquipmentStatus;
  berth?: string;
  assigned_technician_id?: number;
  manufacturer?: string;
  model_number?: string;
  installation_date?: string;
}

// KPI Types
export interface EquipmentKPIs {
  uptime_percentage: number;
  uptime_trend: number;
  avg_downtime_hours: number;
  at_risk_count: number;
  active_alerts_count: number;
  total_equipment: number;
  active_count: number;
  maintenance_count: number;
  stopped_count: number;
}

// Alert Types
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertType = 'maintenance_overdue' | 'inspection_overdue' | 'anomaly_detected' | 'downtime_extended' | 'risk_threshold';

export interface EquipmentAlert {
  id: number;
  equipment_id: number;
  equipment_name: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: string;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  is_read: boolean;
}

// Trend Types
export interface DailyTrend {
  date: string;
  active: number;
  maintenance: number;
  stopped: number;
  total: number;
}

export interface EquipmentTrend {
  period: '7d' | '30d';
  data: DailyTrend[];
  summary: {
    avg_active_rate: number;
    avg_maintenance_rate: number;
    avg_stopped_rate: number;
  };
}

// Risk Score Types
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  name: string;
  score: number;
  description: string;
}

export interface RiskScore {
  equipment_id: number;
  overall_score: number;
  risk_level: RiskLevel;
  factors: RiskFactor[];
  last_inspection_date?: string;
  days_since_inspection?: number;
  next_maintenance_date?: string;
  days_until_maintenance?: number;
  health_score: number;
  calculated_at: string;
}

// Filter Preset Type
export interface FilterPreset {
  id: string;
  name: string;
  filters: {
    status_color?: string;
    berth?: string;
    risk_level?: RiskLevel;
    days_stopped_min?: number;
    days_stopped_max?: number;
    last_inspection?: 'today' | 'week' | 'month' | 'overdue';
    search?: string;
  };
}

// Equipment Watch Types
export interface EquipmentWatch {
  id: number;
  equipment_id: number;
  user_id: number;
  user: {
    id: number;
    full_name: string;
    role_id: string;
    role: string;
  } | null;
  notify_status_change: boolean;
  notify_high_risk: boolean;
  notify_anomaly: boolean;
  notify_maintenance: boolean;
  created_at: string;
}

export interface WatchPreferences {
  notify_status_change?: boolean;
  notify_high_risk?: boolean;
  notify_anomaly?: boolean;
  notify_maintenance?: boolean;
}

// Equipment Note Types
export type NoteType = 'general' | 'maintenance' | 'safety' | 'technical' | 'warning';

export interface EquipmentNote {
  id: number;
  equipment_id: number;
  user_id: number;
  user: {
    id: number;
    full_name: string;
    role_id: string;
    role: string;
  } | null;
  content: string;
  content_en: string;
  content_ar: string | null;
  is_pinned: boolean;
  note_type: NoteType;
  created_at: string;
  updated_at: string;
}

export interface CreateNotePayload {
  content: string;
  content_ar?: string;
  is_pinned?: boolean;
  note_type?: NoteType;
}

// Equipment Certification Types
export type CertificationStatus = 'active' | 'expired' | 'revoked' | 'pending_renewal';

export interface EquipmentCertification {
  id: number;
  equipment_id: number;
  name: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  certification_type: string | null;
  issuing_authority: string | null;
  certificate_number: string | null;
  issued_date: string;
  expiry_date: string | null;
  document_url: string | null;
  document_file_id: number | null;
  status: CertificationStatus;
  days_until_expiry: number | null;
  is_expired: boolean;
  created_by_id: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCertificationPayload {
  name: string;
  name_ar?: string;
  description?: string;
  certification_type?: string;
  issuing_authority?: string;
  certificate_number?: string;
  issued_date: string;
  expiry_date?: string;
  document_url?: string;
}

// Equipment Cost Types
export interface CostTrendItem {
  month: string;
  month_label: string;
  downtime_hours: number;
  downtime_cost: number;
}

export interface EquipmentCosts {
  equipment_id: number;
  hourly_cost: number;
  total_downtime_hours: number;
  total_downtime_cost: number;
  cost_per_defect: number;
  defect_count: number;
  cost_trend: CostTrendItem[];
}

export interface CostConfigPayload {
  hourly_cost?: number;
  criticality_level?: 'low' | 'medium' | 'high' | 'critical';
}

// Gamification Types
export interface EquipmentLeaderboardEntry {
  rank: number;
  user_id: number;
  full_name: string;
  role_id: string;
  inspections_completed: number;
  inspections_passed: number;
  quick_fixes: number;
  assigned_equipment: number;
  points: number;
  total_points: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: string;
  progress: number;
  completed: boolean;
}

export interface AchievementsData {
  achievements: Achievement[];
  total_points: number;
  completed_count: number;
  total_count: number;
}

export interface EquipmentStreak {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  berth: string | null;
  current_status: EquipmentStatus;
  streak_days: number;
  is_active_streak: boolean;
}

// Export Types
export type ExportFormat = 'excel' | 'pdf';

export interface ExportOptions {
  equipment_ids?: number[];
  format: ExportFormat;
  include_history?: boolean;
  include_certifications?: boolean;
  include_notes?: boolean;
}
