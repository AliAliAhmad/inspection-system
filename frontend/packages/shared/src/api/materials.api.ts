import { getApiClient, getApiBaseUrl } from './client';
import { ApiResponse } from '../types';
import {
  Material,
  MaterialKit,
  CreateMaterialPayload,
  CreateMaterialKitPayload,
} from '../types/work-plan.types';
import {
  StockHistoryEntry,
  MaterialBatch,
  StorageLocation,
  Vendor,
  StockReservation,
  StockAlert,
  MaterialInsight,
  ABCCategory,
  ConsumptionReport,
  StockSummary,
  InventoryCount,
  InventoryCountItem,
  ReorderPrediction,
  DemandForecast,
  StockAnomaly,
  CostOptimizationSuggestion,
  DeadStockItem,
  BudgetForecast,
  ConsumePayload,
  RestockPayload,
  AdjustPayload,
  TransferPayload,
  ReservePayload,
  CreateLocationPayload,
  UpdateLocationPayload,
  CreateVendorPayload,
  UpdateVendorPayload,
  CreateCountPayload,
  AddCountItemPayload,
} from '../types/material.types';

export interface MaterialListParams {
  category?: string;
  low_stock?: boolean;
  search?: string;
  active_only?: boolean;
}

export interface MaterialsListResponse {
  status: string;
  materials: Material[];
  count: number;
}

export interface KitsListResponse {
  status: string;
  kits: MaterialKit[];
  count: number;
}

export interface LowStockResponse {
  status: string;
  low_stock_count: number;
  low_stock_materials: Material[];
}

export interface ImportResponse {
  status: string;
  message: string;
  created: number;
  updated: number;
  errors: string[];
}

export interface StockHistoryResponse {
  status: string;
  history: StockHistoryEntry[];
  total: number;
  page: number;
  pages: number;
}

export interface BatchesResponse {
  status: string;
  batches: MaterialBatch[];
  count: number;
}

export interface LocationsResponse {
  status: string;
  locations: StorageLocation[];
  count: number;
}

export interface VendorsResponse {
  status: string;
  vendors: Vendor[];
  count: number;
}

export interface AlertsResponse {
  status: string;
  alerts: StockAlert[];
  count: number;
}

export interface ReservationsResponse {
  status: string;
  reservations: StockReservation[];
  count: number;
}

export interface CountsResponse {
  status: string;
  counts: InventoryCount[];
  count: number;
}

export interface CountItemsResponse {
  status: string;
  items: InventoryCountItem[];
  count: number;
}

export interface ABCAnalysisResponse {
  status: string;
  categories: ABCCategory[];
  total_value: number;
}

export interface InsightsResponse {
  status: string;
  insights: MaterialInsight[];
}

export interface AnomaliesResponse {
  status: string;
  anomalies: StockAnomaly[];
  count: number;
}

export interface CostOptimizationResponse {
  status: string;
  suggestions: CostOptimizationSuggestion[];
  total_potential_savings: number;
}

export interface DeadStockResponse {
  status: string;
  items: DeadStockItem[];
  total_value: number;
  count: number;
}

export interface NaturalLanguageSearchResponse {
  status: string;
  materials: Material[];
  interpretation?: string;
}

export const materialsApi = {
  // ==================== MATERIALS CRUD ====================
  list(params?: MaterialListParams) {
    return getApiClient().get<MaterialsListResponse>('/api/materials', { params });
  },

  get(materialId: number) {
    return getApiClient().get<ApiResponse<Material>>('/api/materials/' + materialId);
  },

  create(payload: CreateMaterialPayload) {
    return getApiClient().post<ApiResponse<Material>>('/api/materials', payload);
  },

  update(materialId: number, payload: Partial<CreateMaterialPayload> & { is_active?: boolean }) {
    return getApiClient().put<ApiResponse<Material>>('/api/materials/' + materialId, payload);
  },

  checkLowStock() {
    return getApiClient().post<LowStockResponse>('/api/materials/stock-check');
  },

  import(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<ImportResponse>('/api/materials/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // ==================== STOCK OPERATIONS ====================
  consume(materialId: number, data: ConsumePayload) {
    return getApiClient().post<ApiResponse<Material>>(`/api/materials/${materialId}/consume`, data);
  },

  restock(materialId: number, data: RestockPayload) {
    return getApiClient().post<ApiResponse<Material>>(`/api/materials/${materialId}/restock`, data);
  },

  adjust(materialId: number, data: AdjustPayload) {
    return getApiClient().post<ApiResponse<Material>>(`/api/materials/${materialId}/adjust`, data);
  },

  transfer(materialId: number, data: TransferPayload) {
    return getApiClient().post<ApiResponse<Material>>(`/api/materials/${materialId}/transfer`, data);
  },

  // ==================== RESERVATIONS ====================
  reserve(materialId: number, data: ReservePayload) {
    return getApiClient().post<ApiResponse<StockReservation>>(`/api/materials/${materialId}/reserve`, data);
  },

  getReservations(materialId?: number) {
    const url = materialId
      ? `/api/materials/${materialId}/reservations`
      : '/api/materials/reservations';
    return getApiClient().get<ReservationsResponse>(url);
  },

  fulfillReservation(reservationId: number) {
    return getApiClient().post<ApiResponse<StockReservation>>(
      `/api/materials/reservations/${reservationId}/fulfill`
    );
  },

  cancelReservation(reservationId: number, reason?: string) {
    return getApiClient().post<ApiResponse<StockReservation>>(
      `/api/materials/reservations/${reservationId}/cancel`,
      { reason }
    );
  },

  // ==================== STOCK SUMMARY ====================
  getStockSummary(materialId: number) {
    return getApiClient().get<ApiResponse<StockSummary>>(`/api/materials/${materialId}/summary`);
  },

  // ==================== HISTORY ====================
  getStockHistory(materialId: number, params?: { page?: number; limit?: number }) {
    return getApiClient().get<StockHistoryResponse>(`/api/materials/${materialId}/history`, { params });
  },

  // ==================== BATCHES ====================
  getBatches(materialId: number, status?: string) {
    return getApiClient().get<BatchesResponse>(`/api/materials/${materialId}/batches`, {
      params: status ? { status } : undefined,
    });
  },

  getBatch(batchId: number) {
    return getApiClient().get<ApiResponse<MaterialBatch>>(`/api/materials/batches/${batchId}`);
  },

  getExpiringBatches(days?: number) {
    return getApiClient().get<BatchesResponse>('/api/materials/batches/expiring', {
      params: { days: days || 30 },
    });
  },

  // ==================== LOCATIONS ====================
  getLocations() {
    return getApiClient().get<LocationsResponse>('/api/materials/locations');
  },

  createLocation(data: CreateLocationPayload) {
    return getApiClient().post<ApiResponse<StorageLocation>>('/api/materials/locations', data);
  },

  updateLocation(id: number, data: UpdateLocationPayload) {
    return getApiClient().put<ApiResponse<StorageLocation>>(`/api/materials/locations/${id}`, data);
  },

  deleteLocation(id: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/materials/locations/${id}`);
  },

  // ==================== VENDORS ====================
  getVendors() {
    return getApiClient().get<VendorsResponse>('/api/materials/vendors');
  },

  createVendor(data: CreateVendorPayload) {
    return getApiClient().post<ApiResponse<Vendor>>('/api/materials/vendors', data);
  },

  updateVendor(id: number, data: UpdateVendorPayload) {
    return getApiClient().put<ApiResponse<Vendor>>(`/api/materials/vendors/${id}`, data);
  },

  deleteVendor(id: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/materials/vendors/${id}`);
  },

  // ==================== ALERTS ====================
  getAlerts() {
    return getApiClient().get<AlertsResponse>('/api/materials/alerts');
  },

  getLowStockAlerts() {
    return getApiClient().get<AlertsResponse>('/api/materials/alerts/low-stock');
  },

  getReorderAlerts() {
    return getApiClient().get<AlertsResponse>('/api/materials/alerts/reorder');
  },

  dismissAlert(alertId: number) {
    return getApiClient().post<ApiResponse<void>>(`/api/materials/alerts/${alertId}/dismiss`);
  },

  // ==================== INVENTORY COUNTS ====================
  getCounts() {
    return getApiClient().get<CountsResponse>('/api/materials/counts');
  },

  getCount(countId: number) {
    return getApiClient().get<ApiResponse<InventoryCount>>(`/api/materials/counts/${countId}`);
  },

  getCountItems(countId: number) {
    return getApiClient().get<CountItemsResponse>(`/api/materials/counts/${countId}/items`);
  },

  createCount(data: CreateCountPayload) {
    return getApiClient().post<ApiResponse<InventoryCount>>('/api/materials/counts', data);
  },

  addCountItem(countId: number, data: AddCountItemPayload) {
    return getApiClient().post<ApiResponse<InventoryCountItem>>(
      `/api/materials/counts/${countId}/items`,
      data
    );
  },

  approveCount(countId: number) {
    return getApiClient().post<ApiResponse<InventoryCount>>(`/api/materials/counts/${countId}/approve`);
  },

  rejectCount(countId: number, reason?: string) {
    return getApiClient().post<ApiResponse<InventoryCount>>(
      `/api/materials/counts/${countId}/reject`,
      { reason }
    );
  },

  // ==================== AI FEATURES ====================
  predictReorder(materialId: number) {
    return getApiClient().get<ApiResponse<ReorderPrediction>>(`/api/materials/${materialId}/predict-reorder`);
  },

  forecastDemand(materialId: number, days?: number) {
    return getApiClient().get<ApiResponse<DemandForecast>>(`/api/materials/${materialId}/forecast`, {
      params: { days: days || 30 },
    });
  },

  getAnomalies(materialId?: number) {
    const url = materialId
      ? `/api/materials/${materialId}/anomalies`
      : '/api/materials/anomalies';
    return getApiClient().get<AnomaliesResponse>(url);
  },

  getOptimalReorder(materialId: number) {
    return getApiClient().get<ApiResponse<{ quantity: number; estimated_cost: number }>>(
      `/api/materials/${materialId}/optimal-reorder`
    );
  },

  getCostOptimization() {
    return getApiClient().get<CostOptimizationResponse>('/api/materials/ai/cost-optimization');
  },

  getInsights(materialId?: number) {
    const url = materialId
      ? `/api/materials/${materialId}/insights`
      : '/api/materials/ai/insights';
    return getApiClient().get<InsightsResponse>(url);
  },

  searchNaturalLanguage(query: string) {
    return getApiClient().post<NaturalLanguageSearchResponse>('/api/materials/ai/search', { query });
  },

  // ==================== ANALYTICS ====================
  getABCAnalysis() {
    return getApiClient().get<ABCAnalysisResponse>('/api/materials/analytics/abc');
  },

  getDeadStock(months?: number) {
    return getApiClient().get<DeadStockResponse>('/api/materials/analytics/dead-stock', {
      params: { months: months || 6 },
    });
  },

  getBudgetForecast(days?: number) {
    return getApiClient().get<ApiResponse<BudgetForecast>>('/api/materials/analytics/budget-forecast', {
      params: { days: days || 30 },
    });
  },

  // ==================== REPORTS ====================
  getConsumptionReport(period?: string) {
    return getApiClient().get<ApiResponse<ConsumptionReport>>('/api/materials/reports/consumption', {
      params: { period: period || 'month' },
    });
  },

  exportMaterials(format?: 'xlsx' | 'csv') {
    return getApiClient().get<Blob>('/api/materials/export', {
      params: { format: format || 'xlsx' },
      responseType: 'blob',
    });
  },

  // ==================== MATERIAL KITS ====================
  listKits(params?: { equipment_type?: string; active_only?: boolean }) {
    return getApiClient().get<KitsListResponse>('/api/materials/kits', { params });
  },

  getKit(kitId: number) {
    return getApiClient().get<ApiResponse<MaterialKit>>('/api/materials/kits/' + kitId);
  },

  createKit(payload: CreateMaterialKitPayload) {
    return getApiClient().post<ApiResponse<MaterialKit>>('/api/materials/kits', payload);
  },

  updateKit(kitId: number, payload: Partial<CreateMaterialKitPayload> & { is_active?: boolean }) {
    return getApiClient().put<ApiResponse<MaterialKit>>('/api/materials/kits/' + kitId, payload);
  },

  deleteKit(kitId: number) {
    return getApiClient().delete<ApiResponse<void>>('/api/materials/kits/' + kitId);
  },

  /**
   * Get the URL for downloading the materials import template
   */
  getTemplateUrl() {
    return `${getApiBaseUrl()}/api/work-plans/templates/materials`;
  },
};
