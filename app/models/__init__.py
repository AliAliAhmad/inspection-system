"""
Database Models Package
Export all models for easy importing
"""

# Core models
from app.models.user import User
from app.models.equipment import Equipment
from app.models.checklist import ChecklistTemplate, ChecklistItem
from app.models.inspection import Inspection, InspectionAnswer
from app.models.defect import Defect
from app.models.defect_occurrence import DefectOccurrence
from app.models.schedule import InspectionSchedule, InspectionRoutine, WeeklyCompletion
from app.models.rating import InspectionRating

# Notification System (must import NotificationGroup before Notification due to FK)
from app.models.notification_group import NotificationGroup
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.notification_schedule import NotificationSchedule
from app.models.notification_escalation import NotificationEscalation
from app.models.notification_rule import NotificationRule
from app.models.notification_analytics import NotificationAnalytics
from app.models.notification_template import NotificationTemplate

# Specialist & Engineer jobs
from app.models.specialist_job import SpecialistJob
from app.models.engineer_job import EngineerJob
from app.models.engineer_job_voice_note import EngineerJobVoiceNote
from app.models.engineer_job_location import EngineerJobLocation

# Quality & Assessment
from app.models.quality_review import QualityReview
from app.models.defect_assessment import DefectAssessment
from app.models.final_assessment import FinalAssessment

# Inspection workflow
from app.models.inspection_list import InspectionList
from app.models.inspection_assignment import InspectionAssignment
from app.models.assignment_template import AssignmentTemplate, AssignmentTemplateItem

# Leave Management System (Enhanced)
from app.models.leave_type import LeaveType
from app.models.leave_policy import LeavePolicy
from app.models.leave_calendar import LeaveCalendar
from app.models.leave_blackout import LeaveBlackout
from app.models.leave import Leave
from app.models.leave_balance_history import LeaveBalanceHistory
from app.models.leave_approval_level import LeaveApprovalLevel
from app.models.compensatory_leave import CompensatoryLeave
from app.models.leave_encashment import LeaveEncashment

# Roster
from app.models.roster import RosterEntry
from app.models.shift_swap_request import ShiftSwapRequest

# Timer & Takeover
from app.models.pause_log import PauseLog
from app.models.job_takeover import JobTakeover

# Rewards
from app.models.bonus_star import BonusStar

# File & Sync
from app.models.file import File
from app.models.sync_queue import SyncQueue

# Auth
from app.models.token_blocklist import TokenBlocklist

# Translation
from app.models.translation import Translation

# Import & Tracking Logs
from app.models.import_log import ImportLog
from app.models.role_swap_log import RoleSwapLog
from app.models.equipment_status_log import EquipmentStatusLog

# Materials Enhancement - Storage & Vendor (must be before Material due to FK)
from app.models.storage_location import StorageLocation
from app.models.vendor import Vendor

# Work Planning
from app.models.material import Material
from app.models.material_kit import MaterialKit, MaterialKitItem
from app.models.maintenance_cycle import MaintenanceCycle
from app.models.pm_template import PMTemplate, PMTemplateChecklistItem, PMTemplateMaterial
from app.models.work_plan import WorkPlan
from app.models.work_plan_day import WorkPlanDay
from app.models.work_plan_job import WorkPlanJob
from app.models.work_plan_assignment import WorkPlanAssignment
from app.models.work_plan_material import WorkPlanMaterial
from app.models.sap_work_order import SAPWorkOrder

# Enhanced Work Planning (must be after WorkPlanJob due to FK)
from app.models.job_template import JobTemplate
from app.models.job_template_material import JobTemplateMaterial
from app.models.job_template_checklist import JobTemplateChecklist
from app.models.job_dependency import JobDependency
from app.models.job_checklist_response import JobChecklistResponse
from app.models.capacity_config import CapacityConfig
from app.models.worker_skill import WorkerSkill
from app.models.equipment_restriction import EquipmentRestriction
from app.models.work_plan_version import WorkPlanVersion
from app.models.scheduling_conflict import SchedulingConflict

# Materials Enhancement - Advanced Models (after Material due to FK)
from app.models.material_batch import MaterialBatch
from app.models.stock_history import StockHistory
from app.models.material_vendor import MaterialVendor
from app.models.stock_reservation import StockReservation
from app.models.inventory_count import InventoryCount, InventoryCountItem
from app.models.price_history import PriceHistory

# Work Plan Tracking & Performance
from app.models.work_plan_job_tracking import WorkPlanJobTracking
from app.models.work_plan_job_log import WorkPlanJobLog
from app.models.work_plan_pause_request import WorkPlanPauseRequest
from app.models.work_plan_job_rating import WorkPlanJobRating
from app.models.work_plan_daily_review import WorkPlanDailyReview
from app.models.work_plan_carry_over import WorkPlanCarryOver
from app.models.work_plan_performance import WorkPlanPerformance

# Equipment Advanced Features
from app.models.equipment_watch import EquipmentWatch
from app.models.equipment_note import EquipmentNote
from app.models.equipment_certification import EquipmentCertification

# Gamification & Leaderboard
from app.models.achievement import Achievement
from app.models.user_achievement import UserAchievement
from app.models.user_streak import UserStreak
from app.models.challenge import Challenge
from app.models.user_challenge import UserChallenge
from app.models.user_level import UserLevel
from app.models.point_history import PointHistory
from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.performance_goal import PerformanceGoal

# Admin Audit
from app.models.admin_activity_log import AdminActivityLog

__all__ = [
    'User',
    'Equipment',
    'ChecklistTemplate',
    'ChecklistItem',
    'Inspection',
    'InspectionAnswer',
    'Defect',
    'DefectOccurrence',
    'InspectionSchedule',
    'InspectionRoutine',
    'WeeklyCompletion',
    'InspectionRating',
    # Notification System
    'Notification',
    'NotificationGroup',
    'NotificationPreference',
    'NotificationSchedule',
    'NotificationEscalation',
    'NotificationRule',
    'NotificationAnalytics',
    'NotificationTemplate',
    'SpecialistJob',
    'EngineerJob',
    'EngineerJobVoiceNote',
    'EngineerJobLocation',
    'QualityReview',
    'DefectAssessment',
    'FinalAssessment',
    'InspectionList',
    'InspectionAssignment',
    'AssignmentTemplate',
    'AssignmentTemplateItem',
    # Leave Management System
    'LeaveType',
    'LeavePolicy',
    'LeaveCalendar',
    'LeaveBlackout',
    'Leave',
    'LeaveBalanceHistory',
    'LeaveApprovalLevel',
    'CompensatoryLeave',
    'LeaveEncashment',
    'RosterEntry',
    'ShiftSwapRequest',
    'PauseLog',
    'JobTakeover',
    'BonusStar',
    'File',
    'SyncQueue',
    'TokenBlocklist',
    'Translation',
    'ImportLog',
    'RoleSwapLog',
    'EquipmentStatusLog',
    # Materials Enhancement - Storage & Vendor
    'StorageLocation',
    'Vendor',
    # Work Planning
    'Material',
    'MaterialKit',
    'MaterialKitItem',
    'MaintenanceCycle',
    'PMTemplate',
    'PMTemplateChecklistItem',
    'PMTemplateMaterial',
    'WorkPlan',
    'WorkPlanDay',
    'WorkPlanJob',
    'WorkPlanAssignment',
    'WorkPlanMaterial',
    'SAPWorkOrder',
    # Materials Enhancement - Advanced Models
    'MaterialBatch',
    'StockHistory',
    'MaterialVendor',
    'StockReservation',
    'InventoryCount',
    'InventoryCountItem',
    'PriceHistory',
    # Work Plan Tracking & Performance
    'WorkPlanJobTracking',
    'WorkPlanJobLog',
    'WorkPlanPauseRequest',
    'WorkPlanJobRating',
    'WorkPlanDailyReview',
    'WorkPlanCarryOver',
    'WorkPlanPerformance',
    # Enhanced Work Planning
    'JobTemplate',
    'JobTemplateMaterial',
    'JobTemplateChecklist',
    'JobDependency',
    'JobChecklistResponse',
    'CapacityConfig',
    'WorkerSkill',
    'EquipmentRestriction',
    'WorkPlanVersion',
    'SchedulingConflict',
    # Equipment Advanced Features
    'EquipmentWatch',
    'EquipmentNote',
    'EquipmentCertification',
    # Gamification & Leaderboard
    'Achievement',
    'UserAchievement',
    'UserStreak',
    'Challenge',
    'UserChallenge',
    'UserLevel',
    'PointHistory',
    'LeaderboardSnapshot',
    'PerformanceGoal',
    # Admin Audit
    'AdminActivityLog',
]
