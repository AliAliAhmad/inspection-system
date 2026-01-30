"""
Create a test specialist job for testing the API
"""

from app import create_app
from app.extensions import db
from app.models import Defect, SpecialistJob, User, Equipment, Inspection, ChecklistTemplate
from datetime import datetime

app = create_app('development')

with app.app_context():
    # Get the specialist user (ID 3)
    specialist = User.query.filter_by(role='specialist').first()
    admin = User.query.filter_by(role='admin').first()
    equipment = Equipment.query.first()
    template = ChecklistTemplate.query.first()
    
    if not specialist:
        print("❌ No specialist found!")
        exit()
    
    print(f"✅ Found specialist: {specialist.full_name} (ID: {specialist.id})")
    
    # Create an inspection first (defects need inspections)
    inspection = Inspection(
        equipment_id=equipment.id,
        template_id=template.id,
        technician_id=specialist.id,
        status='submitted',
        result='fail'
    )
    db.session.add(inspection)
    db.session.flush()
    
    print(f"✅ Created inspection for {equipment.name}")
    
    # Create a defect
    from datetime import timedelta
    
    defect = Defect(
        inspection_id=inspection.id,
        description="Oil leak detected on main pump seal - requires immediate attention",
        severity='high',
        status='in_progress',
        assigned_to_id=specialist.id,
        due_date=datetime.utcnow() + timedelta(days=7)  # Due in 7 days
    )
    
    db.session.add(defect)
    db.session.flush()  # Get the defect ID
    
    print(f"✅ Created defect: {defect.description}")
    
    # Create a specialist job
    # Generate universal_id (simple counter for now)
    last_job = SpecialistJob.query.order_by(SpecialistJob.universal_id.desc()).first()
    next_universal_id = (last_job.universal_id + 1) if last_job else 1
    
    job = SpecialistJob(
        universal_id=next_universal_id,
        job_id=f"SPE{specialist.role_id[-3:]}-{str(next_universal_id).zfill(3)}",
        defect_id=defect.id,
        specialist_id=specialist.id,
        assigned_by=admin.id,
        status='assigned'
    )
    
    db.session.add(job)
    db.session.commit()
    
    print(f"✅ Created specialist job: {job.job_id}")
    print(f"\n📋 Test Job Details:")
    print(f"   Job ID: {job.job_id}")
    print(f"   Universal ID: {job.universal_id}")
    print(f"   Specialist: {specialist.full_name}")
    print(f"   Equipment: {equipment.name}")
    print(f"   Status: {job.status}")
    print(f"\n🎯 Now you can test the API with this job!")