# Industrial Inspection System

A full-stack inspection management platform for industrial equipment. Supports five user roles with dedicated workflows, bilingual UI (English/Arabic with RTL), offline-capable mobile app, and a PWA-enabled web dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, Flask 3.0, SQLAlchemy 2.0, PostgreSQL / SQLite |
| Web | React 18, Vite 6, Ant Design 5, React Router 6, React Query 5 |
| Mobile | React Native 0.76, Expo 52, React Navigation 6, MMKV |
| Shared | TypeScript, Axios, i18next, Vitest, Playwright |
| Auth | JWT (access + refresh tokens), Flask-JWT-Extended |
| Infrastructure | Gunicorn, APScheduler, Flask-Limiter, Alembic migrations |

## Architecture

```
inspection_system/
├── app/                        # Flask backend
│   ├── api/                    # 21 API modules (121 endpoints)
│   ├── models/                 # 23 SQLAlchemy models
│   └── services/               # 20 business logic services
├── frontend/                   # pnpm monorepo
│   ├── apps/web/               # React web app (32 pages)
│   ├── apps/mobile/            # React Native + Expo app
│   └── packages/shared/        # Shared types, API clients, i18n, utils
├── tests/                      # 18 backend test files
├── migrations/                 # Alembic database migrations
└── run.py                      # Flask entry point
```

## User Roles

| Role | Key Workflows |
|------|--------------|
| **Admin** | User/equipment/checklist CRUD, schedules, assignments, approvals, reports |
| **Inspector** | Assigned inspections, checklist completion, photo upload, assessments |
| **Specialist** | Job execution with timers, defect assessment, cleaning verification |
| **Engineer** | Job creation, team assignment, pause approvals, bonus awards |
| **Quality Engineer** | Inspection review, quality approval/rejection, bonus requests |

## Quick Start

### Backend

```bash
# Create virtual environment and install dependencies
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Initialize database
flask db upgrade

# Seed initial data
python seed.py

# Run development server
python run.py
```

The backend runs at `http://localhost:5000`.

### Frontend

```bash
cd frontend
pnpm install

# Web app (http://localhost:3000)
pnpm web:dev

# Mobile app (Expo)
pnpm mobile:start
```

### Environment Variables

**Backend** — set in `.env` or environment:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `sqlite:///dev.db` |
| `JWT_SECRET_KEY` | Secret for JWT signing | (required in production) |
| `REDIS_URL` | Redis for rate limiting/caching | (optional) |

**Frontend** — set in `frontend/apps/web/.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:5000` |
| `VITE_APP_TITLE` | App title | `Inspection System` |

## Running Tests

```bash
# Backend (pytest)
pytest

# Frontend — shared package (98 tests)
pnpm --filter @inspection/shared test

# Frontend — web unit tests (7 tests)
pnpm --filter @inspection/web test

# Frontend — E2E tests (14 Playwright tests)
pnpm --filter @inspection/web e2e

# TypeScript type checking
cd frontend && pnpm typecheck
```

## Key Features

- **121 REST API endpoints** across 21 modules
- **Role-based access control** with major + minor role support
- **Bilingual UI** — English and Arabic with automatic RTL layout
- **PWA support** — installable web app with Workbox API caching
- **Offline infrastructure** — MMKV cache + sync queue on mobile
- **Real-time notifications** — 30-second polling with unread badge
- **Job timers** — start/pause/resume/complete with time tracking
- **Photo capture** — camera integration for inspection evidence
- **Rate limiting** — server-side (Flask-Limiter) + client-side (login brute-force protection)
- **Code splitting** — 32 lazy-loaded pages for fast initial load
- **Comprehensive testing** — 119 frontend tests + backend pytest suite

## Documentation

| Document | Description |
|----------|-------------|
| [`RUN.md`](RUN.md) | Backend setup, env vars, CLI commands, architecture |
| [`PROD_CHECKLIST.md`](PROD_CHECKLIST.md) | Backend production deploy checklist |
| [`TROUBLESHOOTING_GUIDE.md`](TROUBLESHOOTING_GUIDE.md) | Backend troubleshooting (common issues + fixes) |
| [`frontend/UI_RUN.md`](frontend/UI_RUN.md) | Frontend setup, monorepo structure, build steps |
| [`frontend/UI_PROD_CHECKLIST.md`](frontend/UI_PROD_CHECKLIST.md) | Frontend production checklist (125 features verified) |
| [`frontend/UI_TROUBLESHOOTING_GUIDE.md`](frontend/UI_TROUBLESHOOTING_GUIDE.md) | Frontend troubleshooting (12 common issues) |

## License

Private — All rights reserved.
