export interface Schedule {
  id: number;
  equipment_id: number;
  equipment_name: string;
  day_of_week: number;
  frequency: string;
  is_active: boolean;
  next_due: string | null;
  last_completed: string | null;
}

export interface InspectionRoutine {
  id: number;
  routine_name: string;
  asset_types: string[];
  template_id: number;
  frequency: string;
  shift: 'day' | 'night' | 'both';
  is_active: boolean;
}
