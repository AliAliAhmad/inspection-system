"""
Add all missing columns to production database.
Run this on Render: python add_missing_columns.py
"""
from app import create_app
from app.extensions import db

app = create_app()

queries = [
    # Inspection Routines - add frequency column
    "ALTER TABLE inspection_routines ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) DEFAULT 'weekly'",

    # Quality Reviews - ensure AI columns exist
    "ALTER TABLE quality_reviews ADD COLUMN IF NOT EXISTS ai_score FLOAT",
    "ALTER TABLE quality_reviews ADD COLUMN IF NOT EXISTS ai_summary TEXT",

    # Engineer Jobs - ensure AI columns exist
    "ALTER TABLE engineer_jobs ADD COLUMN IF NOT EXISTS ai_priority INTEGER",
    "ALTER TABLE engineer_jobs ADD COLUMN IF NOT EXISTS ai_estimated_duration INTEGER",

    # Defects - ensure AI columns exist
    "ALTER TABLE defects ADD COLUMN IF NOT EXISTS ai_severity VARCHAR(20)",
    "ALTER TABLE defects ADD COLUMN IF NOT EXISTS ai_root_cause TEXT",

    # Work Plan Jobs - ensure tracking columns exist
    "ALTER TABLE work_plan_jobs ADD COLUMN IF NOT EXISTS ai_risk_score FLOAT",
]

with app.app_context():
    for i, query in enumerate(queries, 1):
        try:
            db.session.execute(db.text(query))
            db.session.commit()
            print(f"✅ {i}. {query[:50]}... SUCCESS")
        except Exception as e:
            db.session.rollback()
            error_msg = str(e)[:100]
            if "already exists" in error_msg.lower() or "duplicate column" in error_msg.lower():
                print(f"⏭️  {i}. Column already exists - SKIPPED")
            else:
                print(f"❌ {i}. ERROR: {error_msg}")

print("\n✅ Done! All columns checked/added.")
