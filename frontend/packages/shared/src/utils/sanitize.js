/**
 * Sanitize user input to prevent XSS attacks.
 * Strips HTML tags and escapes special characters.
 */
export function sanitizeInput(input) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}
/**
 * Strip all HTML tags from a string.
 */
export function stripHtml(input) {
    return input.replace(/<[^>]*>/g, '');
}
/**
 * Validate that a string is a safe filename.
 */
export function isSafeFilename(filename) {
    const unsafe = /[<>:"/\\|?*\x00-\x1f]/;
    return !unsafe.test(filename) && filename.length > 0 && filename.length <= 255;
}
/**
 * Sanitize a URL to prevent javascript: protocol attacks.
 */
export function sanitizeUrl(url) {
    const trimmed = url.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return '#';
    }
    return trimmed;
}
//# sourceMappingURL=sanitize.js.map