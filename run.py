"""
Application entry point.
Development: python run.py
Production:  gunicorn -c gunicorn.conf.py 'app:create_app("production")'
"""

from dotenv import load_dotenv
load_dotenv()

from app import create_app
import os

app = create_app(os.getenv('FLASK_ENV', 'development'))

if __name__ == '__main__':
    env = os.getenv('FLASK_ENV', 'development')
    port = int(os.getenv('PORT', '5001'))

    print("\n" + "="*70)
    print("INDUSTRIAL INSPECTION SYSTEM - API SERVER")
    print("="*70)
    print(f"\nEnvironment: {env}")
    print(f"Port: {port}")
    print(f"Routes: 120 endpoints across 21 blueprints")
    print("\nKey Endpoints:")
    print("  Health:              GET  /health")
    print("  Auth:                POST /api/auth/login")
    print("  Inspection Lists:    GET  /api/inspection-assignments/lists")
    print("  Assessments:         GET  /api/assessments")
    print("  Specialist Jobs:     GET  /api/jobs")
    print("  Engineer Jobs:       GET  /api/engineer-jobs")
    print("  Quality Reviews:     GET  /api/quality-reviews")
    print("  Leaves:              GET  /api/leaves")
    print("  Leaderboards:        GET  /api/leaderboards")
    print("  Reports Dashboard:   GET  /api/reports/dashboard")
    if env == 'development':
        print("\nDefault Admin: admin@company.com / admin123")
    print("="*70 + "\n")

    app.run(host='0.0.0.0', port=port, debug=(env == 'development'))