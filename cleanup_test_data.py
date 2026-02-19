"""
Cleanup script: Delete all test data, keep imported/seeded data, reset sequences.
Run on Render Shell: python cleanup_test_data.py
"""

import os
import sys

# Set up Flask app context
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import create_app
from app.extensions import db

app = create_app()


def cleanup():
    """Delete test data in FK-safe order, keep seed data, reset sequences."""

    # Tables to DELETE (test/user-generated data) in FK-safe order
    # Child tables first, parent tables last
    delete_tables = [
        # --- Leaf tables (no dependents) ---
        'admin_activity_logs',
        'answer_templates',
        'bonus_stars',
        'compensatory_leaves',
        'defect_assessments',
        'defect_occurrences',
        'engineer_job_locations',
        'engineer_job_voice_notes',
        'equipment_certifications',
        'equipment_notes',
        'equipment_readings',
        'equipment_restrictions',
        'equipment_status_logs',
        'equipment_watches',
        'import_logs',
        'inspection_answers',
        'inspection_ratings',
        'inspection_routines',
        'inspection_schedules',
        'inventory_count_items',
        'job_challenge_voices',
        'job_checklist_responses',
        'job_dependencies',
        'job_review_marks',
        'job_showup_photos',
        'job_takeovers',
        'job_template_materials',
        'leaderboard_snapshots',
        'leave_approval_levels',
        'leave_balance_history',
        'leave_blackouts',
        'leave_calendar',
        'leave_encashments',
        'leave_policies',
        'material_kit_items',
        'material_vendors',
        'message_read_receipts',
        'notification_analytics',
        'notification_escalations',
        'notification_schedules',
        'point_history',
        'price_history',
        'role_swap_logs',
        'roster_entries',
        'running_hours_alerts',
        'running_hours_readings',
        'scheduling_conflicts',
        'service_intervals',
        'shift_swap_requests',
        'stock_history',
        'stock_reservations',
        'sync_queue',
        'token_blocklist',
        'toolkit_preferences',
        'translations',
        'user_achievements',
        'user_challenges',
        'user_levels',
        'user_streaks',
        'weekly_completions',
        'worker_skills',
        # --- Mid-level tables ---
        'work_plan_assignments',
        'work_plan_carry_overs',
        'work_plan_job_logs',
        'work_plan_job_ratings',
        'work_plan_job_trackings',
        'work_plan_materials',
        'work_plan_pause_requests',
        'work_plan_performances',
        'work_plan_versions',
        'pm_template_checklist_items',
        'pm_template_materials',
        'sap_work_orders',
        'pause_logs',
        'performance_goals',
        'quality_reviews',
        'channel_members',
        'notification_preferences',
        'notification_rules',
        'assignment_template_items',
        # --- Tables with some dependencies ---
        'monitor_followups',
        'specialist_jobs',
        'engineer_jobs',
        'final_assessments',
        'shift_handovers',
        'unplanned_jobs',
        'team_messages',
        'message_read_receipts',
        'work_plan_daily_reviews',
        'work_plan_jobs',
        'defects',
        'notification_groups',
        'notifications',
        'team_channels',
        'work_plan_days',
        'inspections',
        'work_plans',
        'inspection_assignments',
        'leaves',
        'inventory_counts',
        'material_batches',
        'stock_history',
        'material_kit_items',
        'material_kits',
        'pm_templates',
        'job_template_checklists',
        'assignment_templates',
        'files',
        # --- Config tables we can clear ---
        'notification_templates',
        'achievements',
        'challenges',
    ]

    # Tables to KEEP (imported/seeded data):
    # - users
    # - equipment
    # - checklist_templates
    # - checklist_items
    # - inspection_lists
    # - job_templates
    # - leave_types
    # - maintenance_cycles
    # - materials
    # - storage_locations
    # - vendors
    # - capacity_configs

    with app.app_context():
        print("=" * 60)
        print("CLEANUP: Deleting all test data...")
        print("=" * 60)

        deleted_counts = {}

        for table in delete_tables:
            try:
                result = db.session.execute(
                    db.text(f'DELETE FROM "{table}"')
                )
                count = result.rowcount
                if count > 0:
                    deleted_counts[table] = count
                    print(f"  Deleted {count} rows from {table}")
            except Exception as e:
                db.session.rollback()
                err_msg = str(e)
                # Skip tables that don't exist
                if 'does not exist' in err_msg or 'UndefinedTable' in err_msg:
                    pass
                else:
                    print(f"  WARN: {table} — {err_msg[:80]}")
                continue

        db.session.commit()
        print(f"\nDeleted data from {len(deleted_counts)} tables.")

        # Reset all sequences
        print("\n" + "=" * 60)
        print("RESETTING sequences to 1...")
        print("=" * 60)

        # Get all sequences in the database
        result = db.session.execute(db.text(
            "SELECT sequence_name FROM information_schema.sequences "
            "WHERE sequence_schema = 'public'"
        ))
        sequences = [row[0] for row in result]

        reset_count = 0
        for seq in sequences:
            try:
                db.session.execute(db.text(
                    f"ALTER SEQUENCE \"{seq}\" RESTART WITH 1"
                ))
                reset_count += 1
            except Exception as e:
                print(f"  WARN: Could not reset {seq}: {str(e)[:60]}")
                db.session.rollback()

        db.session.commit()
        print(f"Reset {reset_count} sequences to 1.")

        # Summary
        print("\n" + "=" * 60)
        print("DONE! Database is clean.")
        print("=" * 60)
        print("\nKept:")
        print("  - Users (accounts)")
        print("  - Equipment (imported)")
        print("  - Checklist templates + items")
        print("  - Job templates")
        print("  - Leave types")
        print("  - Materials, vendors, storage locations")
        print("\nAll IDs will start from 1 for new records.")


if __name__ == '__main__':
    cleanup()
