/** Mobile Toolkit Types */

export type FABPosition = 'bottom-right' | 'bottom-left' | 'bottom-center';
export type VoiceLanguage = 'en' | 'ar';

export interface ToolkitPreference {
  id: number;
  user_id: number;
  // Worker toolkit
  simple_mode_enabled: boolean;
  fab_enabled: boolean;
  fab_position: FABPosition;
  persistent_notification: boolean;
  voice_commands_enabled: boolean;
  voice_language: VoiceLanguage;
  shake_to_pause: boolean;
  nfc_enabled: boolean;
  widget_enabled: boolean;
  smartwatch_enabled: boolean;
  // Inspector toolkit
  quick_camera_enabled: boolean;
  barcode_scanner_enabled: boolean;
  voice_checklist_enabled: boolean;
  auto_location_enabled: boolean;
  // Engineer toolkit
  team_map_enabled: boolean;
  voice_review_enabled: boolean;
  red_zone_alerts: boolean;
  // QE toolkit
  photo_compare_enabled: boolean;
  voice_rating_enabled: boolean;
  punch_list_enabled: boolean;
  // Admin toolkit
  morning_brief_enabled: boolean;
  kpi_alerts_enabled: boolean;
  emergency_broadcast: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuickAction {
  id: string;
  label: string;
  label_ar: string;
  icon: string;
  color: string;
  action: string;
}

export type VoiceCommandAction = 'pause' | 'complete' | 'incomplete' | 'help' | 'start' | 'photo' | 'defect';

export interface VoiceCommandResult {
  action: VoiceCommandAction | null;
  confidence: number;
  message: string;
  original_text: string;
}

export interface NFCLookupResult {
  equipment: {
    id: number;
    name: string;
    serial_number?: string;
    equipment_type?: string;
    status?: string;
    location?: string;
  };
}

export interface SimpleModeBtnConfig {
  id: string;
  label: string;
  label_ar: string;
  icon: string;
  color: string;
  bgColor: string;
  action: VoiceCommandAction;
}
