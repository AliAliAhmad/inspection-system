/**
 * Sanitize user input to prevent XSS attacks.
 * Strips HTML tags and escapes special characters.
 */
export declare function sanitizeInput(input: string): string;
/**
 * Strip all HTML tags from a string.
 */
export declare function stripHtml(input: string): string;
/**
 * Validate that a string is a safe filename.
 */
export declare function isSafeFilename(filename: string): boolean;
/**
 * Sanitize a URL to prevent javascript: protocol attacks.
 */
export declare function sanitizeUrl(url: string): string;
//# sourceMappingURL=sanitize.d.ts.map