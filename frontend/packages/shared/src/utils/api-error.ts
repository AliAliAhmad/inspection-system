/**
 * API Error Parser Utility
 * Provides consistent error parsing across the application.
 */
import { AxiosError } from 'axios';
import {
  ErrorCode,
  ParsedApiError,
  ApiErrorResponse,
  FieldError,
  isAuthErrorCode,
  isValidationErrorCode,
  isServerErrorCode,
} from '../types/error.types';

/**
 * Default error messages for common scenarios.
 */
const DEFAULT_MESSAGES: Record<string, string> = {
  network: 'Unable to connect to the server. Please check your internet connection.',
  timeout: 'The request timed out. Please try again.',
  offline: 'You are offline. This action will be synced when you are back online.',
  unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Parse an Axios error into a standardized ParsedApiError object.
 */
export function parseApiError(error: unknown): ParsedApiError {
  // Default parsed error
  const parsed: ParsedApiError = {
    code: ErrorCode.UNKNOWN_ERROR,
    message: DEFAULT_MESSAGES.unknown,
    status: 0,
    fieldErrors: [],
    isNetworkError: false,
    isAuthError: false,
    isValidationError: false,
    isNotFound: false,
    isServerError: false,
    raw: error,
  };

  // Not an axios error
  if (!isAxiosError(error)) {
    if (error instanceof Error) {
      parsed.message = error.message;
    }
    return parsed;
  }

  const axiosError = error as AxiosError<ApiErrorResponse>;

  // Network error (no response)
  if (!axiosError.response) {
    parsed.isNetworkError = true;
    parsed.code = ErrorCode.NETWORK_ERROR;

    if (axiosError.code === 'ECONNABORTED') {
      parsed.code = ErrorCode.TIMEOUT_ERROR;
      parsed.message = DEFAULT_MESSAGES.timeout;
    } else if (axiosError.message?.includes('Network Error')) {
      parsed.message = DEFAULT_MESSAGES.network;
    } else {
      parsed.message = axiosError.message || DEFAULT_MESSAGES.network;
    }

    return parsed;
  }

  // Has response - extract error details
  const response = axiosError.response;
  parsed.status = response.status;

  // Try to get structured error from response
  const data = response.data;

  if (data && typeof data === 'object') {
    // New standardized format with code
    if ('code' in data && data.code) {
      parsed.code = data.code;
    }

    // Get message (try multiple fields for backwards compatibility)
    if ('message' in data && data.message) {
      parsed.message = data.message;
    } else if ('error' in data && typeof (data as any).error === 'string') {
      parsed.message = (data as any).error;
    }

    // Get request ID
    if ('request_id' in data && data.request_id) {
      parsed.requestId = data.request_id;
    }

    // Get field errors
    if ('errors' in data && Array.isArray(data.errors)) {
      parsed.fieldErrors = data.errors as FieldError[];
    }
  }

  // If no message, use default based on status
  if (parsed.message === DEFAULT_MESSAGES.unknown) {
    parsed.message = getDefaultMessageForStatus(parsed.status);
  }

  // Set error type flags
  parsed.isAuthError = isAuthErrorCode(parsed.code) || parsed.status === 401 || parsed.status === 403;
  parsed.isValidationError = isValidationErrorCode(parsed.code) || parsed.status === 400 || parsed.status === 422;
  parsed.isNotFound = parsed.code === ErrorCode.RESOURCE_NOT_FOUND || parsed.status === 404;
  parsed.isServerError = isServerErrorCode(parsed.code) || parsed.status >= 500;

  return parsed;
}

/**
 * Get the error message from an error, with fallback.
 * This is a simpler version for quick error message extraction.
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  const parsed = parseApiError(error);
  return parsed.message || fallback || DEFAULT_MESSAGES.unknown;
}

/**
 * Get field-specific errors from an API error.
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  const parsed = parseApiError(error);
  const fieldErrors: Record<string, string> = {};

  for (const fe of parsed.fieldErrors) {
    fieldErrors[fe.field] = fe.message;
  }

  return fieldErrors;
}

/**
 * Check if an error is a specific error code.
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  const parsed = parseApiError(error);
  return parsed.code === code;
}

/**
 * Check if the error is due to being offline.
 */
export function isOfflineError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.isNetworkError;
}

/**
 * Check if the error should trigger a logout (token issues).
 */
export function shouldLogout(error: unknown): boolean {
  const parsed = parseApiError(error);
  return (
    parsed.code === ErrorCode.AUTH_TOKEN_EXPIRED ||
    parsed.code === ErrorCode.AUTH_TOKEN_REVOKED ||
    parsed.code === ErrorCode.AUTH_TOKEN_INVALID
  );
}

/**
 * Check if the error is retryable (transient).
 */
export function isRetryableError(error: unknown): boolean {
  const parsed = parseApiError(error);

  // Network errors are retryable
  if (parsed.isNetworkError) return true;

  // Rate limiting - should retry after delay
  if (parsed.code === ErrorCode.AUTH_RATE_LIMITED) return true;
  if (parsed.status === 429) return true;

  // Server errors (5xx) are usually retryable
  if (parsed.status >= 500 && parsed.status < 600) return true;

  // Timeout
  if (parsed.status === 408) return true;

  return false;
}

/**
 * Get default message for HTTP status code.
 */
function getDefaultMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Your session has expired. Please login again.';
    case 403:
      return 'You don\'t have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with existing data.';
    case 422:
      return 'The request could not be processed.';
    case 429:
      return 'Too many requests. Please try again later.';
    case 500:
      return 'An internal server error occurred.';
    case 502:
    case 503:
    case 504:
      return 'The server is temporarily unavailable. Please try again later.';
    default:
      return DEFAULT_MESSAGES.unknown;
  }
}

/**
 * Type guard for Axios errors.
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Create a user-friendly error message with request ID for support.
 */
export function formatErrorForUser(error: unknown): string {
  const parsed = parseApiError(error);
  let message = parsed.message;

  // Add request ID if available for debugging
  if (parsed.requestId) {
    message += ` (Ref: ${parsed.requestId})`;
  }

  return message;
}
