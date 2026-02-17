export interface ShiftHandover {
  id: number;
  shift_date: string;
  shift_type: 'day' | 'night' | 'morning' | 'afternoon';
  outgoing_user_id: number;
  outgoing_user_name: string | null;
  notes: string | null;
  pending_items: PendingItem[];
  safety_alerts: SafetyAlert[];
  equipment_issues: EquipmentIssue[];
  voice_file_id: number | null;
  voice_url: string | null;
  voice_transcription: { en: string; ar: string } | null;
  acknowledged_by_id: number | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface PendingItem {
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  equipment_name?: string;
}

export interface SafetyAlert {
  alert: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface EquipmentIssue {
  equipment_name: string;
  issue: string;
  status: 'new' | 'ongoing' | 'resolved';
}

export interface CreateHandoverPayload {
  shift_date?: string;
  shift_type: string;
  notes?: string;
  pending_items?: PendingItem[];
  safety_alerts?: SafetyAlert[];
  equipment_issues?: EquipmentIssue[];
  voice_file_id?: number;
  voice_transcription?: { en: string; ar: string };
}
