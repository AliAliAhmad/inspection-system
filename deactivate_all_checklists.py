#!/usr/bin/env python3
"""
One-time script to deactivate all checklist templates.
Run in Render Shell: python deactivate_all_checklists.py
"""
from app import create_app
from app.models import ChecklistTemplate
from app.extensions import db

app = create_app()
with app.app_context():
    templates = ChecklistTemplate.query.all()

    if not templates:
        print("No checklist templates found.")
    else:
        print(f"Found {len(templates)} checklist templates:\n")

        for t in templates:
            print(f"  - ID {t.id}: {t.name} ({t.equipment_type}) - Active: {t.is_active}")
            t.is_active = False

        db.session.commit()
        print(f"\n✅ Deactivated all {len(templates)} checklist templates")

        # Verify
        active = ChecklistTemplate.query.filter_by(is_active=True).count()
        print(f"Active templates remaining: {active}")
