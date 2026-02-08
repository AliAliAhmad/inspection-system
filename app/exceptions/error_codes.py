"""
Centralized error codes for the API.
These codes are used to provide consistent error identification across the application.
"""
from enum import Enum


class ErrorCode(str, Enum):
    """All possible error codes in the application."""

    # Authentication & Authorization (1xxx)
    AUTH_TOKEN_MISSING = "AUTH_TOKEN_MISSING"
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
    AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID"
    AUTH_TOKEN_REVOKED = "AUTH_TOKEN_REVOKED"
    AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
    AUTH_RATE_LIMITED = "AUTH_RATE_LIMITED"
    AUTH_FORBIDDEN = "AUTH_FORBIDDEN"

    # Validation Errors (2xxx)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    VALIDATION_REQUIRED_FIELD = "VALIDATION_REQUIRED_FIELD"
    VALIDATION_INVALID_FORMAT = "VALIDATION_INVALID_FORMAT"
    VALIDATION_INVALID_VALUE = "VALIDATION_INVALID_VALUE"
    VALIDATION_FILE_REQUIRED = "VALIDATION_FILE_REQUIRED"
    VALIDATION_FILE_INVALID = "VALIDATION_FILE_INVALID"
    VALIDATION_DATE_INVALID = "VALIDATION_DATE_INVALID"

    # Resource Errors (3xxx)
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    RESOURCE_ALREADY_EXISTS = "RESOURCE_ALREADY_EXISTS"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    RESOURCE_LOCKED = "RESOURCE_LOCKED"

    # Business Logic Errors (4xxx)
    BUSINESS_INVALID_STATE = "BUSINESS_INVALID_STATE"
    BUSINESS_PREREQUISITE_FAILED = "BUSINESS_PREREQUISITE_FAILED"
    BUSINESS_LIMIT_EXCEEDED = "BUSINESS_LIMIT_EXCEEDED"
    BUSINESS_NOT_ALLOWED = "BUSINESS_NOT_ALLOWED"

    # Inspection Errors (41xx)
    INSPECTION_NOT_STARTED = "INSPECTION_NOT_STARTED"
    INSPECTION_ALREADY_SUBMITTED = "INSPECTION_ALREADY_SUBMITTED"
    INSPECTION_INCOMPLETE = "INSPECTION_INCOMPLETE"
    INSPECTION_REVIEWER_PENDING = "INSPECTION_REVIEWER_PENDING"

    # Job Errors (42xx)
    JOB_NOT_ASSIGNED = "JOB_NOT_ASSIGNED"
    JOB_ALREADY_STARTED = "JOB_ALREADY_STARTED"
    JOB_NOT_STARTED = "JOB_NOT_STARTED"
    JOB_ALREADY_COMPLETED = "JOB_ALREADY_COMPLETED"
    JOB_PAUSED = "JOB_PAUSED"
    JOB_PAUSE_PENDING = "JOB_PAUSE_PENDING"

    # Leave Errors (43xx)
    LEAVE_OVERLAP = "LEAVE_OVERLAP"
    LEAVE_BALANCE_EXCEEDED = "LEAVE_BALANCE_EXCEEDED"
    LEAVE_ALREADY_PROCESSED = "LEAVE_ALREADY_PROCESSED"

    # Quality Review Errors (44xx)
    REVIEW_ALREADY_PROCESSED = "REVIEW_ALREADY_PROCESSED"
    REVIEW_SLA_EXCEEDED = "REVIEW_SLA_EXCEEDED"

    # File Errors (5xxx)
    FILE_UPLOAD_FAILED = "FILE_UPLOAD_FAILED"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    FILE_INVALID_TYPE = "FILE_INVALID_TYPE"
    FILE_PROCESSING_FAILED = "FILE_PROCESSING_FAILED"

    # External Service Errors (6xxx)
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    AI_SERVICE_ERROR = "AI_SERVICE_ERROR"
    STORAGE_SERVICE_ERROR = "STORAGE_SERVICE_ERROR"

    # Server Errors (9xxx)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


# Human-readable error messages for each code
ERROR_MESSAGES = {
    # Authentication & Authorization
    ErrorCode.AUTH_TOKEN_MISSING: "Authorization token is required",
    ErrorCode.AUTH_TOKEN_EXPIRED: "Your session has expired. Please login again",
    ErrorCode.AUTH_TOKEN_INVALID: "Invalid authorization token",
    ErrorCode.AUTH_TOKEN_REVOKED: "Your session has been revoked. Please login again",
    ErrorCode.AUTH_INVALID_CREDENTIALS: "Invalid username or password",
    ErrorCode.AUTH_RATE_LIMITED: "Too many login attempts. Please try again later",
    ErrorCode.AUTH_FORBIDDEN: "You don't have permission to perform this action",

    # Validation
    ErrorCode.VALIDATION_ERROR: "Invalid input data",
    ErrorCode.VALIDATION_REQUIRED_FIELD: "Required field is missing",
    ErrorCode.VALIDATION_INVALID_FORMAT: "Invalid data format",
    ErrorCode.VALIDATION_INVALID_VALUE: "Invalid value provided",
    ErrorCode.VALIDATION_FILE_REQUIRED: "File upload is required",
    ErrorCode.VALIDATION_FILE_INVALID: "Invalid file type or format",
    ErrorCode.VALIDATION_DATE_INVALID: "Invalid date format. Use YYYY-MM-DD",

    # Resource
    ErrorCode.RESOURCE_NOT_FOUND: "The requested resource was not found",
    ErrorCode.RESOURCE_ALREADY_EXISTS: "This resource already exists",
    ErrorCode.RESOURCE_CONFLICT: "This action conflicts with existing data",
    ErrorCode.RESOURCE_LOCKED: "This resource is currently locked",

    # Business Logic
    ErrorCode.BUSINESS_INVALID_STATE: "This action is not valid in the current state",
    ErrorCode.BUSINESS_PREREQUISITE_FAILED: "Required conditions are not met",
    ErrorCode.BUSINESS_LIMIT_EXCEEDED: "Limit has been exceeded",
    ErrorCode.BUSINESS_NOT_ALLOWED: "This action is not allowed",

    # Inspection
    ErrorCode.INSPECTION_NOT_STARTED: "Inspection has not been started yet",
    ErrorCode.INSPECTION_ALREADY_SUBMITTED: "Inspection has already been submitted",
    ErrorCode.INSPECTION_INCOMPLETE: "Inspection is not complete",
    ErrorCode.INSPECTION_REVIEWER_PENDING: "Waiting for other reviewer to complete",

    # Job
    ErrorCode.JOB_NOT_ASSIGNED: "This job is not assigned to you",
    ErrorCode.JOB_ALREADY_STARTED: "This job has already been started",
    ErrorCode.JOB_NOT_STARTED: "This job has not been started yet",
    ErrorCode.JOB_ALREADY_COMPLETED: "This job has already been completed",
    ErrorCode.JOB_PAUSED: "This job is currently paused",
    ErrorCode.JOB_PAUSE_PENDING: "A pause request is pending approval",

    # Leave
    ErrorCode.LEAVE_OVERLAP: "Leave dates overlap with existing leave",
    ErrorCode.LEAVE_BALANCE_EXCEEDED: "Insufficient leave balance",
    ErrorCode.LEAVE_ALREADY_PROCESSED: "This leave request has already been processed",

    # Quality Review
    ErrorCode.REVIEW_ALREADY_PROCESSED: "This review has already been processed",
    ErrorCode.REVIEW_SLA_EXCEEDED: "Review SLA deadline has been exceeded",

    # File
    ErrorCode.FILE_UPLOAD_FAILED: "Failed to upload file",
    ErrorCode.FILE_TOO_LARGE: "File size exceeds the maximum limit",
    ErrorCode.FILE_INVALID_TYPE: "Invalid file type",
    ErrorCode.FILE_PROCESSING_FAILED: "Failed to process the uploaded file",

    # External Services
    ErrorCode.EXTERNAL_SERVICE_ERROR: "External service is temporarily unavailable",
    ErrorCode.AI_SERVICE_ERROR: "AI service is temporarily unavailable",
    ErrorCode.STORAGE_SERVICE_ERROR: "Storage service is temporarily unavailable",

    # Server
    ErrorCode.INTERNAL_ERROR: "An internal error occurred",
    ErrorCode.DATABASE_ERROR: "A database error occurred",
    ErrorCode.UNKNOWN_ERROR: "An unexpected error occurred",
}


# Arabic translations for error messages
ERROR_MESSAGES_AR = {
    # Authentication & Authorization
    ErrorCode.AUTH_TOKEN_MISSING: "رمز التحقق مطلوب",
    ErrorCode.AUTH_TOKEN_EXPIRED: "انتهت صلاحية جلستك. يُرجى تسجيل الدخول مرة أخرى",
    ErrorCode.AUTH_TOKEN_INVALID: "رمز التحقق غير صالح",
    ErrorCode.AUTH_TOKEN_REVOKED: "تم إلغاء جلستك. يُرجى تسجيل الدخول مرة أخرى",
    ErrorCode.AUTH_INVALID_CREDENTIALS: "اسم المستخدم أو كلمة المرور غير صحيحة",
    ErrorCode.AUTH_RATE_LIMITED: "تم تجاوز الحد الأقصى للمحاولات. يُرجى المحاولة لاحقاً",
    ErrorCode.AUTH_FORBIDDEN: "ليس لديك صلاحية لتنفيذ هذا الإجراء",

    # Validation
    ErrorCode.VALIDATION_ERROR: "بيانات غير صالحة",
    ErrorCode.VALIDATION_REQUIRED_FIELD: "حقل مطلوب مفقود",
    ErrorCode.VALIDATION_INVALID_FORMAT: "صيغة البيانات غير صالحة",
    ErrorCode.VALIDATION_INVALID_VALUE: "القيمة المُدخلة غير صالحة",
    ErrorCode.VALIDATION_FILE_REQUIRED: "يجب رفع ملف",
    ErrorCode.VALIDATION_FILE_INVALID: "نوع أو صيغة الملف غير صالح",
    ErrorCode.VALIDATION_DATE_INVALID: "صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD",

    # Resource
    ErrorCode.RESOURCE_NOT_FOUND: "المورد المطلوب غير موجود",
    ErrorCode.RESOURCE_ALREADY_EXISTS: "هذا المورد موجود بالفعل",
    ErrorCode.RESOURCE_CONFLICT: "هذا الإجراء يتعارض مع بيانات موجودة",
    ErrorCode.RESOURCE_LOCKED: "هذا المورد مقفل حالياً",

    # Business Logic
    ErrorCode.BUSINESS_INVALID_STATE: "هذا الإجراء غير صالح في الحالة الحالية",
    ErrorCode.BUSINESS_PREREQUISITE_FAILED: "الشروط المطلوبة غير مستوفاة",
    ErrorCode.BUSINESS_LIMIT_EXCEEDED: "تم تجاوز الحد المسموح",
    ErrorCode.BUSINESS_NOT_ALLOWED: "هذا الإجراء غير مسموح به",

    # Inspection
    ErrorCode.INSPECTION_NOT_STARTED: "لم يتم بدء الفحص بعد",
    ErrorCode.INSPECTION_ALREADY_SUBMITTED: "تم إرسال الفحص مسبقاً",
    ErrorCode.INSPECTION_INCOMPLETE: "الفحص غير مكتمل",
    ErrorCode.INSPECTION_REVIEWER_PENDING: "في انتظار إكمال المراجع الآخر",

    # Job
    ErrorCode.JOB_NOT_ASSIGNED: "هذه المهمة غير مُسندة إليك",
    ErrorCode.JOB_ALREADY_STARTED: "تم بدء هذه المهمة مسبقاً",
    ErrorCode.JOB_NOT_STARTED: "لم يتم بدء هذه المهمة بعد",
    ErrorCode.JOB_ALREADY_COMPLETED: "تم إكمال هذه المهمة مسبقاً",
    ErrorCode.JOB_PAUSED: "هذه المهمة متوقفة مؤقتاً",
    ErrorCode.JOB_PAUSE_PENDING: "طلب الإيقاف المؤقت قيد الانتظار",

    # Leave
    ErrorCode.LEAVE_OVERLAP: "تواريخ الإجازة تتداخل مع إجازة موجودة",
    ErrorCode.LEAVE_BALANCE_EXCEEDED: "رصيد الإجازات غير كافٍ",
    ErrorCode.LEAVE_ALREADY_PROCESSED: "تمت معالجة طلب الإجازة مسبقاً",

    # Quality Review
    ErrorCode.REVIEW_ALREADY_PROCESSED: "تمت معالجة هذه المراجعة مسبقاً",
    ErrorCode.REVIEW_SLA_EXCEEDED: "تم تجاوز الموعد النهائي للمراجعة",

    # File
    ErrorCode.FILE_UPLOAD_FAILED: "فشل رفع الملف",
    ErrorCode.FILE_TOO_LARGE: "حجم الملف يتجاوز الحد المسموح",
    ErrorCode.FILE_INVALID_TYPE: "نوع الملف غير صالح",
    ErrorCode.FILE_PROCESSING_FAILED: "فشل معالجة الملف المرفوع",

    # External Services
    ErrorCode.EXTERNAL_SERVICE_ERROR: "الخدمة الخارجية غير متاحة مؤقتاً",
    ErrorCode.AI_SERVICE_ERROR: "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً",
    ErrorCode.STORAGE_SERVICE_ERROR: "خدمة التخزين غير متاحة مؤقتاً",

    # Server
    ErrorCode.INTERNAL_ERROR: "حدث خطأ داخلي",
    ErrorCode.DATABASE_ERROR: "حدث خطأ في قاعدة البيانات",
    ErrorCode.UNKNOWN_ERROR: "حدث خطأ غير متوقع",
}


def get_error_message(code: ErrorCode, lang: str = 'en') -> str:
    """Get the human-readable error message for an error code."""
    if lang == 'ar':
        return ERROR_MESSAGES_AR.get(code, ERROR_MESSAGES.get(code, "Unknown error"))
    return ERROR_MESSAGES.get(code, "Unknown error")
