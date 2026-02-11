/**
 * Get color for risk level
 * @param level - Risk level
 * @returns Hex color code
 */
export const getRiskColor = (level: string): string => {
  const colors: Record<string, string> = {
    critical: '#ff4d4f', // red
    high: '#fa8c16',     // orange
    medium: '#faad14',   // yellow
    low: '#52c41a',      // green
  };
  return colors[level.toLowerCase()] || '#d9d9d9'; // default gray
};

/**
 * Get Ant Design tag color for risk level
 * @param level - Risk level
 * @returns Ant Design color name
 */
export const getRiskTagColor = (level: string): string => {
  const tagColors: Record<string, string> = {
    critical: 'error',
    high: 'warning',
    medium: 'gold',
    low: 'success',
  };
  return tagColors[level.toLowerCase()] || 'default';
};

/**
 * Format trend direction to readable text
 * @param trend - Trend direction
 * @returns Formatted text with arrow
 */
export const formatTrend = (trend: string): string => {
  const trends: Record<string, string> = {
    improving: '↑ Improving',
    stable: '→ Stable',
    degrading: '↓ Degrading',
    declining: '↓ Declining', // alias
  };
  return trends[trend.toLowerCase()] || trend;
};

/**
 * Get color for trend direction
 * @param trend - Trend direction
 * @returns Hex color code
 */
export const getTrendColor = (trend: string): string => {
  const colors: Record<string, string> = {
    improving: '#52c41a', // green
    stable: '#8c8c8c',    // gray
    degrading: '#ff4d4f', // red
    declining: '#ff4d4f', // red (alias)
  };
  return colors[trend.toLowerCase()] || '#8c8c8c';
};

/**
 * Calculate days until due date
 * @param dueDate - Due date string (ISO format)
 * @returns Number of days (negative if overdue)
 */
export const getDaysUntilDue = (dueDate: string): number => {
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Format days until due to readable text
 * @param days - Number of days
 * @returns Formatted text
 */
export const formatDaysUntilDue = (days: number): string => {
  if (days < 0) {
    return `${Math.abs(days)} days overdue`;
  } else if (days === 0) {
    return 'Due today';
  } else if (days === 1) {
    return 'Due tomorrow';
  } else {
    return `${days} days remaining`;
  }
};

/**
 * Format capacity utilization percentage
 * @param rate - Utilization rate (0-1 or 0-100)
 * @returns Formatted percentage string
 */
export const formatUtilization = (rate: number): string => {
  // Handle both decimal (0-1) and percentage (0-100) formats
  const percentage = rate <= 1 ? rate * 100 : rate;
  return `${percentage.toFixed(1)}%`;
};

/**
 * Get status for capacity utilization
 * @param rate - Utilization rate (0-1)
 * @returns Status text
 */
export const getCapacityStatus = (rate: number): 'good' | 'high' | 'overloaded' => {
  if (rate < 0.7) return 'good';
  if (rate < 0.9) return 'high';
  return 'overloaded';
};

/**
 * Get color for capacity utilization
 * @param rate - Utilization rate (0-1)
 * @returns Hex color code
 */
export const getCapacityColor = (rate: number): string => {
  const status = getCapacityStatus(rate);
  const colors = {
    good: '#52c41a',      // green
    high: '#faad14',      // yellow
    overloaded: '#ff4d4f', // red
  };
  return colors[status];
};

/**
 * Format distance in kilometers
 * @param km - Distance in kilometers
 * @returns Formatted string
 */
export const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)} m`;
  }
  return `${km.toFixed(1)} km`;
};

/**
 * Format time in minutes to readable format
 * @param minutes - Time in minutes
 * @returns Formatted string (e.g., "2h 30m" or "45m")
 */
export const formatTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

/**
 * Get severity order for sorting
 * @param severity - Severity level
 * @returns Numeric order (lower = more severe)
 */
export const getSeverityOrder = (severity: string): number => {
  const order: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };
  return order[severity.toLowerCase()] || 5;
};

/**
 * Sort items by severity (critical first)
 * @param items - Array of items with severity property
 * @returns Sorted array
 */
export const sortBySeverity = <T extends { severity: string }>(items: T[]): T[] => {
  return [...items].sort((a, b) => getSeverityOrder(a.severity) - getSeverityOrder(b.severity));
};
