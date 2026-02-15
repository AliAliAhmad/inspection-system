import type {
  InspectorScore,
  TeamPerformance,
  FatigueAlert,
  RouteOptimization,
  RouteOptimizationRequest,
  InspectorListItem,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const BASE_URL = `${API_BASE_URL}/api/schedule-ai`;

async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const scheduleAIApi = {
  /**
   * Get inspector quality scores for the scoreboard
   */
  getInspectorScores: async (): Promise<InspectorScore[]> => {
    return fetchWithAuth<InspectorScore[]>(`${BASE_URL}/inspector-scores`);
  },

  /**
   * Get team performance data for the dashboard
   */
  getTeamPerformance: async (timeRange: 'week' | 'month' | 'quarter' = 'week'): Promise<TeamPerformance> => {
    const params = new URLSearchParams({ time_range: timeRange });
    return fetchWithAuth<TeamPerformance>(`${BASE_URL}/team-performance?${params}`);
  },

  /**
   * Get fatigue alerts for inspectors
   */
  getFatigueAlerts: async (): Promise<FatigueAlert[]> => {
    return fetchWithAuth<FatigueAlert[]>(`${BASE_URL}/fatigue-alerts`);
  },

  /**
   * Dismiss a fatigue alert
   */
  dismissFatigueAlert: async (alertId: number): Promise<void> => {
    await fetchWithAuth<void>(`${BASE_URL}/fatigue-alerts/${alertId}/dismiss`, {
      method: 'POST',
    });
  },

  /**
   * Get route optimization suggestions
   */
  getRouteOptimization: async (params: RouteOptimizationRequest): Promise<RouteOptimization> => {
    const searchParams = new URLSearchParams();
    if (params.inspector_id) {
      searchParams.set('inspector_id', params.inspector_id.toString());
    }
    searchParams.set('optimization_goal', params.optimization_goal);
    if (params.date) {
      searchParams.set('date', params.date);
    }
    return fetchWithAuth<RouteOptimization>(`${BASE_URL}/route-optimization?${searchParams}`);
  },

  /**
   * Apply an optimized route
   */
  applyOptimizedRoute: async (routeId: number): Promise<void> => {
    await fetchWithAuth<void>(`${BASE_URL}/route-optimization/${routeId}/apply`, {
      method: 'POST',
    });
  },

  /**
   * Get list of inspectors for filtering
   */
  getInspectorsList: async (): Promise<InspectorListItem[]> => {
    return fetchWithAuth<InspectorListItem[]>(`${API_BASE_URL}/api/users/inspectors`);
  },
};
