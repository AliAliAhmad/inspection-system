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
