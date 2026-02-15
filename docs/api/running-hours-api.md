# Running Hours API Documentation

## Overview

The Running Hours API provides endpoints for tracking equipment operating hours and managing service schedules. This enables proactive maintenance scheduling based on actual equipment usage.

## Authentication

All endpoints require JWT authentication via Bearer token.

## Endpoints

### 1. Get Equipment Running Hours

**GET** `/api/equipment/{id}/running-hours`

Returns current running hours data for a specific equipment.

**Response:**
```json
{
  "success": true,
  "data": {
    "equipment_id": 123,
    "equipment_name": "Crane A1",
    "equipment_type": "Crane",
    "current_hours": 4532,
    "last_reading": {
      "id": 456,
      "equipment_id": 123,
      "hours": 4532,
      "recorded_at": "2024-02-15T10:30:00Z",
      "recorded_by_id": 1,
      "recorded_by": {
        "id": 1,
        "full_name": "John Doe",
        "role_id": "inspector"
      },
      "notes": "Monthly reading",
      "source": "manual",
      "hours_since_last": 120,
      "days_since_last": 7
    },
    "service_interval": {
      "id": 789,
      "equipment_id": 123,
      "service_interval_hours": 500,
      "alert_threshold_hours": 50,
      "last_service_date": "2024-01-15",
      "last_service_hours": 4000,
      "next_service_hours": 4500
    },
    "service_status": "approaching",
    "hours_until_service": 32,
    "hours_overdue": null,
    "progress_percent": 94,
    "assigned_engineer_id": 5,
    "assigned_engineer": {
      "id": 5,
      "full_name": "Mike Engineer",
      "email": "mike@example.com"
    },
    "location": "Terminal 1",
    "berth": "B1"
  }
}
```

### 2. Update Running Hours (Record New Reading)

**POST** `/api/equipment/{id}/running-hours`

Records a new meter reading for equipment.

**Request Body:**
```json
{
  "hours": 4600,
  "notes": "Weekly meter reading",
  "source": "manual"  // "manual" | "meter" | "estimated"
}
```

**Validation:**
- `hours` must be greater than or equal to the last recorded hours
- `source` defaults to "manual" if not provided

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 457,
    "equipment_id": 123,
    "hours": 4600,
    "recorded_at": "2024-02-15T14:00:00Z",
    "recorded_by_id": 1,
    "notes": "Weekly meter reading",
    "source": "manual",
    "hours_since_last": 68,
    "days_since_last": 3
  }
}
```

### 3. Get Running Hours History

**GET** `/api/equipment/{id}/running-hours/history`

Returns historical running hours readings.

**Query Parameters:**
- `days` (optional): Number of days to look back (default: 90)
- `limit` (optional): Maximum number of readings (default: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "readings": [
      {
        "id": 457,
        "equipment_id": 123,
        "hours": 4600,
        "recorded_at": "2024-02-15T14:00:00Z",
        "recorded_by": {...},
        "notes": "Weekly meter reading",
        "source": "manual",
        "hours_since_last": 68,
        "days_since_last": 3
      }
    ],
    "total_readings": 52,
    "avg_hours_per_day": 8.5,
    "max_hours": 4600,
    "min_hours": 4000,
    "date_range": {
      "start": "2023-11-15",
      "end": "2024-02-15"
    }
  }
}
```

### 4. Get Service Interval Settings

**GET** `/api/equipment/{id}/service-interval`

Returns service interval configuration for equipment.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 789,
    "equipment_id": 123,
    "service_interval_hours": 500,
    "alert_threshold_hours": 50,
    "last_service_date": "2024-01-15",
    "last_service_hours": 4000,
    "next_service_hours": 4500,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T10:00:00Z"
  }
}
```

### 5. Update Service Interval Settings (Admin Only)

**PATCH** `/api/equipment/{id}/service-interval`

Updates service interval configuration.

**Request Body:**
```json
{
  "service_interval_hours": 500,
  "alert_threshold_hours": 50,
  "last_service_date": "2024-01-15",
  "last_service_hours": 4000
}
```

### 6. Reset Service Hours (After Maintenance)

**POST** `/api/equipment/{id}/service-interval/reset`

Resets the service counter after completing maintenance.

**Request Body:**
```json
{
  "service_date": "2024-02-15",
  "hours_at_service": 4600,
  "notes": "Annual service completed"
}
```

### 7. List Equipment Running Hours

**GET** `/api/equipment/running-hours`

Returns paginated list of all equipment with running hours data.

**Query Parameters:**
- `status` (optional): Filter by service status ("ok" | "approaching" | "overdue")
- `location` (optional): Filter by location
- `equipment_type` (optional): Filter by equipment type
- `assigned_engineer_id` (optional): Filter by assigned engineer
- `sort_by` (optional): Sort field ("urgency" | "hours" | "name" | "status")
- `sort_order` (optional): "asc" | "desc" (default: "desc")
- `search` (optional): Search by equipment name
- `page` (optional): Page number (default: 1)
- `per_page` (optional): Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### 8. Get Running Hours Summary

**GET** `/api/equipment/running-hours/summary`

Returns summary statistics across all equipment.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_equipment": 150,
    "with_running_hours": 120,
    "ok_count": 85,
    "approaching_count": 25,
    "overdue_count": 10,
    "avg_hours": 3500,
    "equipment_by_status": {
      "ok": [...],
      "approaching": [...],
      "overdue": [...]
    }
  }
}
```

### 9. Get Equipment Approaching/Overdue Service

**GET** `/api/equipment/service-due`

Returns equipment that needs service soon or is overdue.

**Query Parameters:**
- `status` (optional): "approaching" | "overdue"
- `limit` (optional): Maximum number of results (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "equipment_id": 123,
      "equipment_name": "Crane A1",
      "equipment_type": "Crane",
      "location": "Terminal 1",
      "berth": "B1",
      "current_hours": 4532,
      "next_service_hours": 4500,
      "hours_until_service": -32,
      "service_status": "overdue",
      "assigned_engineer_id": 5,
      "assigned_engineer_name": "Mike Engineer",
      "urgency_score": 95
    }
  ]
}
```

### 10. Get Running Hours Alerts

**GET** `/api/equipment/running-hours/alerts`

Returns service-related alerts.

**Query Parameters:**
- `acknowledged` (optional): boolean
- `severity` (optional): "warning" | "critical"
- `limit` (optional): Maximum number of results

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "equipment_id": 123,
      "equipment_name": "Crane A1",
      "alert_type": "overdue_service",
      "severity": "critical",
      "message": "Service overdue by 32 hours",
      "hours_value": 4532,
      "threshold_value": 4500,
      "created_at": "2024-02-15T10:00:00Z",
      "acknowledged_at": null,
      "acknowledged_by_id": null
    }
  ]
}
```

### 11. Acknowledge Alert

**PUT** `/api/equipment/running-hours/alerts/{alert_id}/acknowledge`

Acknowledges a running hours alert.

### 12. Bulk Update Running Hours

**POST** `/api/equipment/running-hours/bulk-update`

Updates running hours for multiple equipment at once.

**Request Body:**
```json
{
  "updates": [
    { "equipment_id": 123, "hours": 4600, "notes": "Batch update" },
    { "equipment_id": 124, "hours": 3200 }
  ]
}
```

### 13. Export Running Hours Report

**GET** `/api/equipment/running-hours/export`

Exports running hours data to Excel/CSV.

**Query Parameters:**
- `format` (optional): "csv" | "xlsx" (default: "xlsx")
- `status` (optional): Filter by status

## Database Schema

### running_hours_readings

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| equipment_id | INTEGER | Foreign key to equipment |
| hours | DECIMAL | Meter reading in hours |
| recorded_at | TIMESTAMP | When reading was recorded |
| recorded_by_id | INTEGER | User who recorded |
| notes | TEXT | Optional notes |
| source | VARCHAR(20) | "manual", "meter", "estimated" |

### service_intervals

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| equipment_id | INTEGER | Foreign key to equipment |
| service_interval_hours | INTEGER | Service every X hours |
| alert_threshold_hours | INTEGER | Alert X hours before |
| last_service_date | DATE | Date of last service |
| last_service_hours | DECIMAL | Hours at last service |
| next_service_hours | DECIMAL | Calculated next service hours |

### running_hours_alerts

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| equipment_id | INTEGER | Foreign key to equipment |
| alert_type | VARCHAR(50) | Type of alert |
| severity | VARCHAR(20) | "warning" or "critical" |
| message | TEXT | Alert message |
| hours_value | DECIMAL | Current hours |
| threshold_value | DECIMAL | Threshold that triggered |
| created_at | TIMESTAMP | When alert was created |
| acknowledged_at | TIMESTAMP | When acknowledged |
| acknowledged_by_id | INTEGER | User who acknowledged |

## Notifications

The system should send notifications when:

1. **Approaching Service** (Warning)
   - When hours_until_service <= alert_threshold_hours
   - Recipients: Admin, Assigned Engineer

2. **Service Overdue** (Critical)
   - When current_hours > next_service_hours
   - Recipients: Admin, Assigned Engineer

3. **Hours Spike** (Info)
   - When hours increase > 2x average daily usage
   - Recipients: Admin

4. **Reading Gap** (Warning)
   - When no reading for > 14 days
   - Recipients: Admin
