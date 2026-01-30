/**
 * Format ISO date string to readable format.
 */
export function formatDate(isoString) {
    if (!isoString)
        return '-';
    return new Date(isoString).toLocaleDateString();
}
/**
 * Format ISO datetime string to readable format.
 */
export function formatDateTime(isoString) {
    if (!isoString)
        return '-';
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
/**
 * Format hours as "Xh Ym".
 */
export function formatHours(hours) {
    if (hours === null || hours === undefined)
        return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0)
        return `${m}m`;
    if (m === 0)
        return `${h}h`;
    return `${h}h ${m}m`;
}
/**
 * Get relative time string (e.g. "2 hours ago").
 */
export function timeAgo(isoString) {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1)
        return 'just now';
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
//# sourceMappingURL=date-utils.js.map