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

# Quality & Assessment
from app.models.quality_review import QualityReview
from app.models.defect_assessment import DefectAssessment
from app.models.final_assessment import FinalAssessment

# Inspection workflow
from app.models.inspection_list import InspectionList
from app.models.inspection_assignment import InspectionAssignment

# Leave & Coverage
from app.models.leave import Leave

# Roster
from app.models.roster import RosterEntry

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
    'QualityReview',
    'DefectAssessment',
    'FinalAssessment',
    'InspectionList',
    'InspectionAssignment',
    'Leave',
    'RosterEntry',
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
    # Work Plan Tracking & Performance
    'WorkPlanJobTracking',
    'WorkPlanJobLog',
    'WorkPlanPauseRequest',
    'WorkPlanJobRating',
    'WorkPlanDailyReview',
    'WorkPlanCarryOver',
    'WorkPlanPerformance',
    # Equipment Advanced Features
    'EquipmentWatch',
    'EquipmentNote',
    'EquipmentCertification',
]
