"""
Seed script to populate database with initial data.
Creates users for all roles, equipment with berths, routines, and sample data.
Run: python seed_data.py
"""

from app import create_app
from app.extensions import db
from app.models import (
    User, Equipment, ChecklistTemplate, ChecklistItem,
    InspectionRoutine, InspectionSchedule
)
from datetime import datetime, date, timedelta


def seed_database():
    """Populate database with comprehensive test data."""

    app = create_app('development')

    with app.app_context():
        print("Creating database tables...")
        db.create_all()

        # ==========================================
        # USERS
        # ==========================================
        print("Creating users...")

        # Admin
        admin = User(
            email='admin@company.com',
            full_name='Ahmad Al-Rashid',
            role='admin',
            role_id='ADM001',
            phone='+966501234567',
            language='en',
            is_active=True
        )
        admin.set_password('admin123')
        db.session.add(admin)

        # Mechanical Inspectors (Day shift)
        mech_insp1 = User(
            email='mech.inspector1@company.com',
            full_name='Omar Hassan',
            role='inspector',
            role_id='INS001',
            specialization='mechanical',
            shift='day',
            phone='+966501234568',
            language='en',
            is_active=True
        )
        mech_insp1.set_password('inspector123')
        db.session.add(mech_insp1)

        mech_insp2 = User(
            email='mech.inspector2@company.com',
            full_name='Khalid Al-Zahrani',
            role='inspector',
            role_id='INS002',
            specialization='mechanical',
            shift='day',
            phone='+966501234569',
            language='ar',
            is_active=True
        )
        mech_insp2.set_password('inspector123')
        db.session.add(mech_insp2)

        # Electrical Inspectors (Day shift)
        elec_insp1 = User(
            email='elec.inspector1@company.com',
            full_name='Saeed Al-Qahtani',
            role='inspector',
            role_id='INS003',
            specialization='electrical',
            shift='day',
            phone='+966501234570',
            language='en',
            is_active=True
        )
        elec_insp1.set_password('inspector123')
        db.session.add(elec_insp1)

        elec_insp2 = User(
            email='elec.inspector2@company.com',
            full_name='Fahad Al-Dosari',
            role='inspector',
            role_id='INS004',
            specialization='electrical',
            shift='day',
            phone='+966501234571',
            language='ar',
            is_active=True
        )
        elec_insp2.set_password('inspector123')
        db.session.add(elec_insp2)

        # Night shift inspectors
        mech_insp_night = User(
            email='mech.night@company.com',
            full_name='Ali Al-Shehri',
            role='inspector',
            role_id='INS005',
            specialization='mechanical',
            shift='night',
            phone='+966501234572',
            language='en',
            is_active=True
        )
        mech_insp_night.set_password('inspector123')
        db.session.add(mech_insp_night)

        elec_insp_night = User(
            email='elec.night@company.com',
            full_name='Nasser Al-Harbi',
            role='inspector',
            role_id='INS006',
            specialization='electrical',
            shift='night',
            phone='+966501234573',
            language='en',
            is_active=True
        )
        elec_insp_night.set_password('inspector123')
        db.session.add(elec_insp_night)

        # Specialists (with minor role)
        specialist1 = User(
            email='specialist1@company.com',
            full_name='Mohammed Al-Otaibi',
            role='specialist',
            role_id='SPE001',
            minor_role='inspector',
            minor_role_id='INS-SPE001',
            specialization='mechanical',
            shift='day',
            phone='+966501234574',
            language='en',
            is_active=True
        )
        specialist1.set_password('specialist123')
        db.session.add(specialist1)

        specialist2 = User(
            email='specialist2@company.com',
            full_name='Abdulrahman Al-Ghamdi',
            role='specialist',
            role_id='SPE002',
            shift='day',
            phone='+966501234575',
            language='ar',
            is_active=True
        )
        specialist2.set_password('specialist123')
        db.session.add(specialist2)

        specialist3 = User(
            email='specialist3@company.com',
            full_name='Ibrahim Al-Malki',
            role='specialist',
            role_id='SPE003',
            shift='night',
            phone='+966501234576',
            language='en',
            is_active=True
        )
        specialist3.set_password('specialist123')
        db.session.add(specialist3)

        # Engineers
        engineer1 = User(
            email='engineer1@company.com',
            full_name='Tariq Al-Subaie',
            role='engineer',
            role_id='ENG001',
            shift='day',
            phone='+966501234577',
            language='en',
            is_active=True
        )
        engineer1.set_password('engineer123')
        db.session.add(engineer1)

        engineer2 = User(
            email='engineer2@company.com',
            full_name='Bandar Al-Muqrin',
            role='engineer',
            role_id='ENG002',
            shift='night',
            phone='+966501234578',
            language='ar',
            is_active=True
        )
        engineer2.set_password('engineer123')
        db.session.add(engineer2)

        # Quality Engineers
        qe1 = User(
            email='qe1@company.com',
            full_name='Sultan Al-Dawsari',
            role='quality_engineer',
            role_id='QE001',
            shift='day',
            phone='+966501234579',
            language='en',
            is_active=True
        )
        qe1.set_password('qe123')
        db.session.add(qe1)

        qe2 = User(
            email='qe2@company.com',
            full_name='Faisal Al-Yami',
            role='quality_engineer',
            role_id='QE002',
            shift='night',
            phone='+966501234580',
            language='ar',
            is_active=True
        )
        qe2.set_password('qe123')
        db.session.add(qe2)

        db.session.commit()
        print("  Users created successfully!")

        # ==========================================
        # EQUIPMENT (with berths)
        # ==========================================
        print("Creating equipment...")

        equipment_data = [
            # East berth - Centrifugal Pumps
            ('Pump A-101', 'Centrifugal Pump', 'CP-2024-001', 'Terminal 1', 'east', 'east',
             'Pump A-101 (Arabic)', 'Centrifugal Pump (Arabic)', 'Terminal 1 (Arabic)'),
            ('Pump A-102', 'Centrifugal Pump', 'CP-2024-002', 'Terminal 1', 'east', 'east',
             None, None, None),
            ('Pump A-103', 'Centrifugal Pump', 'CP-2024-003', 'Terminal 1', 'east', 'east',
             None, None, None),

            # East berth - Diesel Generators
            ('Generator B-201', 'Diesel Generator', 'DG-2024-001', 'Terminal 1', 'east', 'east',
             None, None, None),
            ('Generator B-202', 'Diesel Generator', 'DG-2024-002', 'Terminal 1', 'east', 'east',
             None, None, None),

            # West berth - Electric Motors
            ('Motor C-301', 'Electric Motor', 'EM-2024-001', 'Terminal 2', 'west', 'west',
             None, None, None),
            ('Motor C-302', 'Electric Motor', 'EM-2024-002', 'Terminal 2', 'west', 'west',
             None, None, None),

            # West berth - Compressors
            ('Compressor D-401', 'Compressor', 'CM-2024-001', 'Terminal 2', 'west', 'west',
             None, None, None),
            ('Compressor D-402', 'Compressor', 'CM-2024-002', 'Terminal 2', 'west', 'west',
             None, None, None),

            # East berth - Cranes
            ('Crane E-501', 'Crane', 'CR-2024-001', 'Terminal 1', 'east', 'east',
             None, None, None),
        ]

        for name, etype, serial, loc, berth, home_berth, name_ar, type_ar, loc_ar in equipment_data:
            equip = Equipment(
                name=name,
                equipment_type=etype,
                serial_number=serial,
                location=loc,
                berth=berth,
                home_berth=home_berth,
                name_ar=name_ar,
                equipment_type_ar=type_ar,
                location_ar=loc_ar,
                status='active',
                assigned_technician_id=mech_insp1.id
            )
            db.session.add(equip)

        db.session.commit()
        print("  Equipment created successfully!")

        # ==========================================
        # CHECKLIST TEMPLATES (with categories)
        # ==========================================
        print("Creating checklist templates...")

        # Pump template
        pump_template = ChecklistTemplate(
            name='Centrifugal Pump Inspection',
            name_ar='فحص المضخة الطاردة المركزية',
            equipment_type='Centrifugal Pump',
            version='2.0',
            is_active=True,
            created_by_id=admin.id
        )
        db.session.add(pump_template)
        db.session.commit()

        pump_items = [
            # Mechanical questions
            ('Check for oil leaks around pump seals', 'تحقق من تسرب الزيت حول أختام المضخة',
             'pass_fail', True, 1, True, 'mechanical'),
            ('Check vibration levels within tolerance', 'تحقق من أن مستويات الاهتزاز ضمن الحدود المسموحة',
             'pass_fail', True, 2, True, 'mechanical'),
            ('Verify bearing temperature', 'تحقق من درجة حرارة المحامل',
             'pass_fail', True, 3, True, 'mechanical'),
            ('Inspect coupling alignment', 'فحص محاذاة الوصلة',
             'pass_fail', True, 4, False, 'mechanical'),
            ('Check foundation bolts', 'فحص مسامير الأساس',
             'pass_fail', True, 5, False, 'mechanical'),

            # Electrical questions
            ('Verify motor insulation resistance', 'التحقق من مقاومة عزل المحرك',
             'pass_fail', True, 6, True, 'electrical'),
            ('Check electrical connections and terminals', 'فحص التوصيلات والأطراف الكهربائية',
             'pass_fail', True, 7, True, 'electrical'),
            ('Verify motor current draw', 'التحقق من سحب التيار الكهربائي',
             'pass_fail', True, 8, False, 'electrical'),
            ('Check cable condition', 'فحص حالة الكابلات',
             'pass_fail', True, 9, False, 'electrical'),
            ('Verify earthing connections', 'التحقق من وصلات التأريض',
             'pass_fail', True, 10, True, 'electrical'),
        ]

        for q, q_ar, atype, req, order, critical, category in pump_items:
            item = ChecklistItem(
                template_id=pump_template.id,
                question_text=q,
                question_text_ar=q_ar,
                answer_type=atype,
                is_required=req,
                order_index=order,
                critical_failure=critical,
                category=category
            )
            db.session.add(item)

        # Generator template
        gen_template = ChecklistTemplate(
            name='Diesel Generator Inspection',
            name_ar='فحص مولد الديزل',
            equipment_type='Diesel Generator',
            version='1.0',
            is_active=True,
            created_by_id=admin.id
        )
        db.session.add(gen_template)
        db.session.commit()

        gen_items = [
            ('Check fuel system for leaks', 'فحص نظام الوقود للتسربات',
             'pass_fail', True, 1, True, 'mechanical'),
            ('Inspect coolant levels', 'فحص مستويات سائل التبريد',
             'pass_fail', True, 2, False, 'mechanical'),
            ('Check belt tension and condition', 'فحص شد وحالة السيور',
             'pass_fail', True, 3, False, 'mechanical'),
            ('Verify exhaust system integrity', 'التحقق من سلامة نظام العادم',
             'pass_fail', True, 4, True, 'mechanical'),
            ('Check alternator output voltage', 'فحص جهد خرج المولد',
             'pass_fail', True, 5, True, 'electrical'),
            ('Verify control panel indicators', 'التحقق من مؤشرات لوحة التحكم',
             'pass_fail', True, 6, False, 'electrical'),
            ('Check battery voltage and connections', 'فحص جهد البطارية والتوصيلات',
             'pass_fail', True, 7, True, 'electrical'),
            ('Inspect wiring harness', 'فحص حزمة الأسلاك',
             'pass_fail', True, 8, False, 'electrical'),
        ]

        for q, q_ar, atype, req, order, critical, category in gen_items:
            item = ChecklistItem(
                template_id=gen_template.id,
                question_text=q,
                question_text_ar=q_ar,
                answer_type=atype,
                is_required=req,
                order_index=order,
                critical_failure=critical,
                category=category
            )
            db.session.add(item)

        db.session.commit()
        print("  Checklist templates created successfully!")

        # ==========================================
        # INSPECTION ROUTINES
        # ==========================================
        print("Creating inspection routines...")

        # Daily pump inspection routine (day shift, Mon-Fri)
        pump_routine = InspectionRoutine(
            name='Daily Pump Inspection',
            name_ar='فحص المضخات اليومي',
            asset_types=['Centrifugal Pump'],
            shift='day',
            days_of_week=[0, 1, 2, 3, 4],  # Mon-Fri
            template_id=pump_template.id,
            is_active=True
        )
        db.session.add(pump_routine)

        # Weekly generator inspection (day shift, Sunday only)
        gen_routine = InspectionRoutine(
            name='Weekly Generator Inspection',
            name_ar='فحص المولدات الأسبوعي',
            asset_types=['Diesel Generator'],
            shift='day',
            days_of_week=[6],  # Sunday
            template_id=gen_template.id,
            is_active=True
        )
        db.session.add(gen_routine)

        # Night shift pump inspection (Mon, Wed, Fri)
        night_routine = InspectionRoutine(
            name='Night Pump Inspection',
            name_ar='فحص المضخات الليلي',
            asset_types=['Centrifugal Pump'],
            shift='night',
            days_of_week=[0, 2, 4],  # Mon, Wed, Fri
            template_id=pump_template.id,
            is_active=True
        )
        db.session.add(night_routine)

        db.session.commit()
        print("  Inspection routines created successfully!")

        # ==========================================
        # SUMMARY
        # ==========================================
        print("\n" + "=" * 60)
        print("  DATABASE SEEDED SUCCESSFULLY!")
        print("=" * 60)
        print("\nLogin Credentials:")
        print("-" * 40)
        print("\nAdmin:")
        print("  Email: admin@company.com")
        print("  Password: admin123")
        print("\nMechanical Inspectors (Day):")
        print("  Email: mech.inspector1@company.com")
        print("  Email: mech.inspector2@company.com")
        print("  Password: inspector123")
        print("\nElectrical Inspectors (Day):")
        print("  Email: elec.inspector1@company.com")
        print("  Email: elec.inspector2@company.com")
        print("  Password: inspector123")
        print("\nNight Inspectors:")
        print("  Email: mech.night@company.com")
        print("  Email: elec.night@company.com")
        print("  Password: inspector123")
        print("\nSpecialists:")
        print("  Email: specialist1@company.com (has minor inspector role)")
        print("  Email: specialist2@company.com")
        print("  Email: specialist3@company.com (night)")
        print("  Password: specialist123")
        print("\nEngineers:")
        print("  Email: engineer1@company.com (day)")
        print("  Email: engineer2@company.com (night)")
        print("  Password: engineer123")
        print("\nQuality Engineers:")
        print("  Email: qe1@company.com (day)")
        print("  Email: qe2@company.com (night)")
        print("  Password: qe123")
        print("\nEquipment: 10 assets across east and west berths")
        print("Templates: Centrifugal Pump (10 questions), Diesel Generator (8 questions)")
        print("Routines: 3 active inspection routines")
        print("\n" + "=" * 60 + "\n")


if __name__ == '__main__':
    import os
    if os.getenv('FLASK_ENV') == 'production':
        confirm = input("WARNING: You are about to seed a PRODUCTION database. Type 'YES' to confirm: ")
        if confirm != 'YES':
            print("Aborted.")
            exit(1)
    seed_database()
