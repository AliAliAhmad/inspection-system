from app import create_app
from app.models import ChecklistTemplate
from app.extensions import db

app = create_app()
with app.app_context():
    templates = ChecklistTemplate.query.all()
    print(f'Found {len(templates)} templates')
    for t in templates:
        t.is_active = False
    db.session.commit()
    print('Done - all templates deactivated')
