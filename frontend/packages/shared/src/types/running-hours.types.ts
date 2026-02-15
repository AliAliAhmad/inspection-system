// Running Hours Types for Equipment Service Tracking

export type ServiceStatus = 'ok' | 'approaching' | 'overdue';

export interface RunningHoursReading {
  id: number;
  equipment_id: number;
  hours: number;
  recorded_at: string;
  recorded_by_id: number;
  recorded_by: {
    id: number;
    full_name: string;
    role_id: string;
  } | null;
  notes: string | null;
  source: 'manual' | 'meter' | 'estimated';
  hours_since_last: number | null;
  days_since_last: number | null;
}

export interface ServiceInterval {
  id: number;
  equipment_id: number;
  service_interval_hours: number;
  alert_threshold_hours: number;
  last_service_date: string | null;
  last_service_hours: number;
  next_service_hours: number;
  created_at: string;
  updated_at: string;
}

export interface RunningHoursData {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  current_hours: number;
  last_reading: RunningHoursReading | null;
  service_interval: ServiceInterval | null;
  service_status: ServiceStatus;
  hours_until_service: number | null;
  hours_overdue: number | null;
  progress_percent: number;
  assigned_engineer_id: number | null;
  assigned_engineer: {
    id: number;
    full_name: string;
    email: string;
  } | null;
  location: string;
  berth: string | null;
}

export interface RunningHoursSummary {
  total_equipment: number;
  with_running_hours: number;
  ok_count: number;
  approaching_count: number;
  overdue_count: number;
  avg_hours: number;
  equipment_by_status: {
    ok: RunningHoursData[];
    approaching: RunningHoursData[];
    overdue: RunningHoursData[];
  };
}

export interface CreateRunningHoursReadingPayload {
  hours: number;
  notes?: string;
  source?: 'manual' | 'meter' | 'estimated';
}

export interface UpdateServiceIntervalPayload {
  service_interval_hours: number;
  alert_threshold_hours: number;
  last_service_date?: string;
  last_service_hours?: number;
}

export interface ResetServicePayload {
  service_date: string;
  hours_at_service: number;
  notes?: string;
}

export interface ServiceDueEquipment {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  location: string;
  berth: string | null;
  current_hours: number;
  next_service_hours: number;
  hours_until_service: number;
  service_status: ServiceStatus;
  assigned_engineer_id: number | null;
  assigned_engineer_name: string | null;
  urgency_score: number;
}

export interface RunningHoursAlert {
  id: number;
  equipment_id: number;
  equipment_name: string;
  alert_type: 'approaching_service' | 'overdue_service' | 'hours_spike' | 'reading_gap';
  severity: 'warning' | 'critical';
  message: string;
  hours_value: number | null;
  threshold_value: number | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by_id: number | null;
}

export interface RunningHoursHistory {
  readings: RunningHoursReading[];
  total_readings: number;
  avg_hours_per_day: number;
  max_hours: number;
  min_hours: number;
  date_range: {
    start: string;
    end: string;
  };
}
