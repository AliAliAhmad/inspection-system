import { Material } from './work-plan.types';

// Stock History Entry
export interface StockHistoryEntry {
  id: number;
  material_id: number;
  change_type: 'consume' | 'restock' | 'adjust' | 'transfer' | 'return' | 'waste';
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason?: string;
  source_type?: string;
  source_id?: number;
  user_name?: string;
  created_at: string;
}

// Material Batch
export interface MaterialBatch {
  id: number;
  material_id: number;
  batch_number: string;
  lot_number?: string;
  quantity: number;
  received_date?: string;
  expiry_date?: string;
  vendor_name?: string;
  status: 'available' | 'reserved' | 'expired' | 'depleted';
  days_until_expiry?: number;
  is_expired: boolean;
}

// Storage Location
export interface StorageLocation {
  id: number;
  code: string;
  name: string;
  warehouse?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  is_active: boolean;
}

// Vendor
export interface Vendor {
  id: number;
  code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  lead_time_days?: number;
  rating?: number;
  is_active: boolean;
}

// Stock Reservation
export interface StockReservation {
  id: number;
  material_id: number;
  material_name: string;
  quantity: number;
  reservation_type: string;
  job_id?: number;
  reserved_by: string;
  reserved_at: string;
  needed_by_date?: string;
  status: 'active' | 'fulfilled' | 'cancelled';
}

// Stock Alert
export interface StockAlert {
  id: number;
  material_id: number;
  material_name: string;
  material_code: string;
  alert_type: 'low_stock' | 'critical' | 'expiring' | 'reorder';
  severity: 'warning' | 'critical';
  current_stock: number;
  min_stock?: number;
  message: string;
}

// Material Insight
export interface MaterialInsight {
  insight: string;
  type: 'trend' | 'pattern' | 'anomaly' | 'recommendation';
  material_id?: number;
  material_name?: string;
}

// ABC Category
export interface ABCCategory {
  category: 'A' | 'B' | 'C';
  materials: Material[];
  total_value: number;
  percentage: number;
}

// Consumption Report
export interface ConsumptionReport {
  period: string;
  total_consumed: number;
  total_value: number;
  top_items: { material: Material; quantity: number; value: number }[];
  by_category: Record<string, number>;
  trends: { direction: string; change_percent: number };
}

// Stock Summary
export interface StockSummary {
  material_id: number;
  current_stock: number;
  reserved_quantity: number;
  available_quantity: number;
  min_stock: number;
  reorder_point?: number;
  average_consumption: number;
  days_of_stock?: number;
  last_restocked?: string;
  last_consumed?: string;
}

// Inventory Count
export interface InventoryCount {
  id: number;
  count_date: string;
  status: 'in_progress' | 'pending_approval' | 'approved' | 'rejected';
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  items_count: number;
  variance_count: number;
}

// Inventory Count Item
export interface InventoryCountItem {
  id: number;
  count_id: number;
  material_id: number;
  material_code: string;
  material_name: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number;
  notes?: string;
}

// Reorder Prediction
export interface ReorderPrediction {
  material_id: number;
  material_name: string;
  predicted_reorder_date: string;
  confidence_score: number;
  recommended_quantity: number;
  current_stock: number;
  average_consumption: number;
  lead_time_days?: number;
}

// Demand Forecast
export interface DemandForecast {
  material_id: number;
  material_name: string;
  forecast_period: string;
  predicted_demand: number;
  confidence_interval: { low: number; high: number };
  historical_average: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

// Stock Anomaly
export interface StockAnomaly {
  id: number;
  material_id: number;
  material_name: string;
  anomaly_type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  detected_at: string;
  is_resolved: boolean;
}

// Cost Optimization Suggestion
export interface CostOptimizationSuggestion {
  type: 'bulk_order' | 'vendor_switch' | 'dead_stock' | 'reorder_timing';
  material_id?: number;
  material_name?: string;
  description: string;
  potential_savings: number;
  confidence: number;
  action_items: string[];
}

// Dead Stock Item
export interface DeadStockItem {
  material: Material;
  last_movement_date?: string;
  months_idle: number;
  quantity: number;
  estimated_value: number;
}

// Budget Forecast
export interface BudgetForecast {
  period: string;
  forecasted_spend: number;
  historical_spend: number;
  variance_percent: number;
  by_category: Record<string, number>;
  top_items: { material_name: string; forecasted_spend: number }[];
}

// Payload Types

export interface ConsumePayload {
  quantity: number;
  reason?: string;
  job_id?: number;
  batch_id?: number;
}

export interface RestockPayload {
  quantity: number;
  batch_info?: {
    batch_number?: string;
    lot_number?: string;
    expiry_date?: string;
  };
  vendor_id?: number;
  location_id?: number;
}

export interface AdjustPayload {
  new_quantity: number;
  reason: string;
}

export interface TransferPayload {
  from_location_id: number;
  to_location_id: number;
  quantity: number;
}

export interface ReservePayload {
  quantity: number;
  job_id?: number;
  needed_by_date?: string;
  reservation_type?: string;
}

export interface CreateLocationPayload {
  code: string;
  name: string;
  warehouse?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
}

export interface UpdateLocationPayload {
  name?: string;
  warehouse?: string;
  zone?: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  is_active?: boolean;
}

export interface CreateVendorPayload {
  code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  lead_time_days?: number;
}

export interface UpdateVendorPayload {
  name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  lead_time_days?: number;
  rating?: number;
  is_active?: boolean;
}

export interface CreateCountPayload {
  notes?: string;
}

export interface AddCountItemPayload {
  material_id: number;
  counted_quantity: number;
  notes?: string;
}
