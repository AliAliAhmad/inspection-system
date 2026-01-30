"""
Quick fix script to update all model relationships
Run this once: python fix_relationships.py
"""

import os
import re

def fix_file(filepath, old_pattern, new_pattern):
    """Replace pattern in file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        if old_pattern in content or re.search(old_pattern, content):
            content = re.sub(old_pattern, new_pattern, content)
            
            with open(filepath, 'w') as f:
                f.write(content)
            
            print(f"✅ Fixed: {filepath}")
        else:
            print(f"⚠️  Pattern not found in: {filepath}")
    except Exception as e:
        print(f"❌ Error fixing {filepath}: {e}")

print("🔧 Fixing model relationships...")
print("="*50)

# Fix Equipment model
fix_file(
    'app/models/equipment.py',
    r"assigned_technician = db\.relationship\('User', back_populates='assigned_equipment'\)",
    "assigned_technician = db.relationship('User', backref='assigned_equipment')"
)

# Fix ChecklistTemplate model
fix_file(
    'app/models/checklist.py',
    r"created_by = db\.relationship\('User', back_populates='created_templates'\)",
    "created_by = db.relationship('User', backref='created_templates')"
)

# Fix Inspection model - technician relationship
fix_file(
    'app/models/inspection.py',
    r"technician = db\.relationship\('User', foreign_keys=\[technician_id\], back_populates='inspections'\)",
    "technician = db.relationship('User', foreign_keys=[technician_id], backref='inspections')"
)

# Fix Inspection model - reviewed_by relationship
fix_file(
    'app/models/inspection.py',
    r"reviewed_by = db\.relationship\('User', foreign_keys=\[reviewed_by_id\], back_populates='reviewed_inspections'\)",
    "reviewed_by = db.relationship('User', foreign_keys=[reviewed_by_id], backref='reviewed_inspections')"
)

print("="*50)
print("🎉 Relationship fixes completed!")
print("\nNow run: python seed_data.py")