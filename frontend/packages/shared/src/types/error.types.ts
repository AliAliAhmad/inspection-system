/**
 * Centralized error types matching backend error codes.
 */

/**
 * All possible error codes from the API.
 * These match the backend ErrorCode enum in app/exceptions/error_codes.py
 */
export enum ErrorCode {
  // Authentication & Authorization
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_REVOKED = 'AUTH_TOKEN_REVOKED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',

  // Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  VALIDATION_REQUIRED_FIELD = 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_INVALID_VALUE = 'VALIDATION_INVALID_VALUE',
  VALIDATION_FILE_REQUIRED = 'VALIDATION_FILE_REQUIRED',
  VALIDATION_FILE_INVALID = 'VALIDATION_FILE_INVALID',
  VALIDATION_DATE_INVALID = 'VALIDATION_DATE_INVALID',

  // Resource Errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',

  // Business Logic Errors
  BUSINESS_INVALID_STATE = 'BUSINESS_INVALID_STATE',
  BUSINESS_PREREQUISITE_FAILED = 'BUSINESS_PREREQUISITE_FAILED',
  BUSINESS_LIMIT_EXCEEDED = 'BUSINESS_LIMIT_EXCEEDED',
  BUSINESS_NOT_ALLOWED = 'BUSINESS_NOT_ALLOWED',

  // Inspection Errors
  INSPECTION_NOT_STARTED = 'INSPECTION_NOT_STARTED',
  INSPECTION_ALREADY_SUBMITTED = 'INSPECTION_ALREADY_SUBMITTED',
  INSPECTION_INCOMPLETE = 'INSPECTION_INCOMPLETE',
  INSPECTION_REVIEWER_PENDING = 'INSPECTION_REVIEWER_PENDING',

  // Job Errors
  JOB_NOT_ASSIGNED = 'JOB_NOT_ASSIGNED',
  JOB_ALREADY_STARTED = 'JOB_ALREADY_STARTED',
  JOB_NOT_STARTED = 'JOB_NOT_STARTED',
  JOB_ALREADY_COMPLETED = 'JOB_ALREADY_COMPLETED',
  JOB_PAUSED = 'JOB_PAUSED',
  JOB_PAUSE_PENDING = 'JOB_PAUSE_PENDING',

  // Leave Errors
  LEAVE_OVERLAP = 'LEAVE_OVERLAP',
  LEAVE_BALANCE_EXCEEDED = 'LEAVE_BALANCE_EXCEEDED',
  LEAVE_ALREADY_PROCESSED = 'LEAVE_ALREADY_PROCESSED',

  // Quality Review Errors
  REVIEW_ALREADY_PROCESSED = 'REVIEW_ALREADY_PROCESSED',
  REVIEW_SLA_EXCEEDED = 'REVIEW_SLA_EXCEEDED',

  // File Errors
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_INVALID_TYPE = 'FILE_INVALID_TYPE',
  FILE_PROCESSING_FAILED = 'FILE_PROCESSING_FAILED',

  // External Service Errors
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  STORAGE_SERVICE_ERROR = 'STORAGE_SERVICE_ERROR',

  // Server Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',

  // Client-side errors (not from API)
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  OFFLINE = 'OFFLINE',
}

/**
 * Field-level error for form validation.
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Standardized API error response from the backend.
 */
export interface ApiErrorResponse {
  status: 'error';
  code: ErrorCode | string;
  message: string;
  request_id?: string;
  errors?: FieldError[];
}

/**
 * Parsed error object for use in the frontend.
 */
export interface ParsedApiError {
  code: ErrorCode | string;
  message: string;
  status: number;
  requestId?: string;
  fieldErrors: FieldError[];
  isNetworkError: boolean;
  isAuthError: boolean;
  isValidationError: boolean;
  isNotFound: boolean;
  isServerError: boolean;
  raw?: unknown;
}

/**
 * Error categories for easy checking.
 */
export const AUTH_ERROR_CODES = [
  ErrorCode.AUTH_TOKEN_MISSING,
  ErrorCode.AUTH_TOKEN_EXPIRED,
  ErrorCode.AUTH_TOKEN_INVALID,
  ErrorCode.AUTH_TOKEN_REVOKED,
  ErrorCode.AUTH_INVALID_CREDENTIALS,
  ErrorCode.AUTH_RATE_LIMITED,
  ErrorCode.AUTH_FORBIDDEN,
] as const;

export const VALIDATION_ERROR_CODES = [
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.VALIDATION_REQUIRED_FIELD,
  ErrorCode.VALIDATION_INVALID_FORMAT,
  ErrorCode.VALIDATION_INVALID_VALUE,
  ErrorCode.VALIDATION_FILE_REQUIRED,
  ErrorCode.VALIDATION_FILE_INVALID,
  ErrorCode.VALIDATION_DATE_INVALID,
] as const;

export const SERVER_ERROR_CODES = [
  ErrorCode.INTERNAL_ERROR,
  ErrorCode.DATABASE_ERROR,
  ErrorCode.UNKNOWN_ERROR,
  ErrorCode.EXTERNAL_SERVICE_ERROR,
  ErrorCode.AI_SERVICE_ERROR,
  ErrorCode.STORAGE_SERVICE_ERROR,
] as const;

/**
 * Check if an error code is an auth error.
 */
export function isAuthErrorCode(code: string): boolean {
  return (AUTH_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Check if an error code is a validation error.
 */
export function isValidationErrorCode(code: string): boolean {
  return (VALIDATION_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Check if an error code is a server error.
 */
export function isServerErrorCode(code: string): boolean {
  return (SERVER_ERROR_CODES as readonly string[]).includes(code);
}
