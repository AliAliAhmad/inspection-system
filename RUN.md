# Industrial Inspection System - Run Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | 3.13 used in Docker image |
| PostgreSQL | 16+ | Production; SQLite used for dev |
| Redis | 7+ | Production rate-limiting storage |
| Node.js | 18+ | Frontend only |
| pnpm | 8+ | Frontend only |

---

## 1. Local Development Setup (Backend)

```bash
# Clone and enter directory
cd inspection_system

# Create virtual environment
python -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
# Edit .env — for local dev, defaults work with SQLite

# Initialize database
flask db upgrade

# (Optional) Seed default admin user
python seed.py   # if seed script exists, otherwise create via API

# Run development server
python run.py
```

The server starts on `http://localhost:5001` (configurable via `PORT` env var).

### Development defaults
- Database: SQLite at `instance/inspection.db`
- JWT access token: 24 hours
- Rate limiting: disabled in-memory
- Log level: DEBUG
- Scheduler: runs automatically (skipped in testing mode)

---

## 2. Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FLASK_ENV` | Yes | `development` | `development`, `production`, or `testing` |
| `SECRET_KEY` | Prod | `dev-secret-key-...` | Flask secret key. **Must change in production.** |
| `JWT_SECRET_KEY` | Prod | `jwt-secret-key-...` | JWT signing key. **Must change in production.** |
| `DATABASE_URL` | Prod | SQLite (dev) | PostgreSQL connection string for production |
| `REDIS_URL` | No | `memory://` | Redis URL for rate-limit storage in production |
| `RATELIMIT_STORAGE_URI` | No | `memory://` | Overrides rate-limit backend |
| `UPLOAD_FOLDER` | No | `instance/uploads` | File upload directory |
| `MAX_CONTENT_LENGTH` | No | 16 MB | Max upload size |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `LOG_FILE` | No | `instance/logs/app.log` | Log file path |
| `CORS_ORIGINS` | No | `*` | Comma-separated origins, or `*` |
| `PORT` | No | `5001` | Dev server port |
| `OPENAI_API_KEY` | No | — | For auto-translation (EN to AR) |
| `OPENAI_TRANSLATE_MODEL` | No | `gpt-4o-mini` | OpenAI model for translation |
| `GUNICORN_BIND` | No | `0.0.0.0:5000` | Gunicorn bind address |
| `GUNICORN_WORKERS` | No | `CPU*2+1` | Number of worker processes |
| `GUNICORN_THREADS` | No | `4` | Threads per worker |
| `DB_POOL_SIZE` | No | `10` | SQLAlchemy connection pool size |

**Production requires:** `SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL` — the app will refuse to start without them.

---

## 3. Database Migrations

```bash
# Apply all pending migrations
flask db upgrade

# Create a new migration after model changes
flask db migrate -m "description of change"

# Downgrade one revision
flask db downgrade

# Show current revision
flask db current

# Show migration history
flask db history
```

---

## 4. Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_defects.py

# Run with coverage report
pytest --cov=app --cov-report=term-missing

# Run only a specific test class
pytest tests/test_defects.py::TestDefects
```

Tests use an in-memory SQLite database and do not require PostgreSQL or Redis.

Current test count: **99 tests** across 9 test files.

---

## 5. Docker Deployment (Production)

### Quick start

```bash
# Build and start all services (API + PostgreSQL + Redis)
docker compose up -d --build

# Check service status
docker compose ps

# View API logs
docker compose logs -f api

# Run database migrations inside container
docker compose exec api flask db upgrade

# Stop all services
docker compose down

# Stop and remove data volumes (full reset)
docker compose down -v
```

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `api` | Custom (Dockerfile) | 5000 | Flask + Gunicorn |
| `db` | postgres:16-alpine | 5432 (internal) | PostgreSQL database |
| `redis` | redis:7-alpine | 6379 (internal) | Rate-limit storage |

### Volumes

| Volume | Purpose |
|--------|---------|
| `pgdata` | PostgreSQL data persistence |
| `uploads` | File upload storage |
| `logs` | Application log files |

---

## 6. Production Without Docker

```bash
# Install production dependencies
pip install -r requirements.txt gunicorn psycopg2-binary

# Set environment
export FLASK_ENV=production
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export DATABASE_URL=postgresql://user:pass@localhost:5432/inspection

# Run migrations
flask db upgrade

# Start with Gunicorn
gunicorn -c gunicorn.conf.py 'app:create_app("production")'
```

### Gunicorn configuration (`gunicorn.conf.py`)

- Worker class: `gthread` (threaded)
- Workers: `CPU * 2 + 1` (configurable via `GUNICORN_WORKERS`)
- Threads per worker: 4
- Request timeout: 120s
- Max requests per worker: 1000 (auto-restart to prevent memory leaks)
- Preloads app for faster worker startup

---

## 7. Background Scheduler

The scheduler starts automatically with the application (except in testing mode). It runs 6 tasks:

| Task | Schedule | Description |
|------|----------|-------------|
| `generate_daily_lists` | Daily at 1:00 PM | Creates next-day inspection assignments |
| `check_backlog` | Every 1 hour | Flags overdue assignments (30h deadline) |
| `detect_stalled_jobs` | Every 6 hours | Notifies about jobs paused 3+ days |
| `check_expired_leaves` | Daily at 00:30 | Ends expired leave records |
| `activate_starting_leaves` | Daily at 00:15 | Marks users as on-leave when leave starts |
| `monitor_qe_sla` | Every 4 hours | Alerts QEs about overdue reviews |

No external task runner (Celery, etc.) is needed — APScheduler runs in-process.

---

## 8. API Endpoints Overview

The API serves 120+ endpoints across 22 blueprints at the `/api/*` prefix.

| Prefix | Module | Auth |
|--------|--------|------|
| `/api/auth` | Login, logout, refresh, profile | Public (login) |
| `/api/users` | User CRUD | Admin |
| `/api/equipment` | Equipment CRUD | JWT |
| `/api/checklists` | Template + item management | JWT |
| `/api/inspections` | Inspection lifecycle | JWT |
| `/api/defects` | Defect lifecycle | JWT |
| `/api/schedules` | Weekly schedule management | JWT |
| `/api/ratings` | Inspection ratings | JWT |
| `/api/notifications` | User notifications | JWT |
| `/api/jobs` | Specialist job lifecycle | JWT |
| `/api/engineer-jobs` | Engineer job lifecycle | JWT |
| `/api/inspection-assignments` | Assignment + list management | JWT |
| `/api/assessments` | Inspector assessments | JWT |
| `/api/defect-assessments` | Specialist defect assessments | JWT |
| `/api/quality-reviews` | QE review workflow | JWT |
| `/api/leaves` | Leave management | JWT |
| `/api/leaderboards` | Performance leaderboards | JWT |
| `/api/bonus-stars` | Bonus star awards | JWT |
| `/api/files` | File upload/download | JWT |
| `/api/sync` | Mobile offline sync | JWT |
| `/api/reports` | Dashboard + analytics | JWT |
| `/health` | Health check | Public |

---

## 9. Health Check

```bash
curl http://localhost:5000/health
```

Response (healthy):
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "database": "connected",
  "timestamp": "2026-01-30T12:00:00"
}
```

Response (degraded — DB unreachable):
```json
{
  "status": "degraded",
  "version": "2.0.0",
  "database": "unreachable",
  "timestamp": "2026-01-30T12:00:00"
}
```

HTTP status: `200` when healthy, `503` when degraded.

---

## 10. User Roles

| Role | Key Permissions |
|------|-----------------|
| `admin` | Full system access, user/equipment CRUD, approvals |
| `inspector` (mechanical/electrical) | Assigned inspections, assessments, defect reporting |
| `specialist` | Job execution, timers, defect assessments, cleaning |
| `engineer` | Job creation, team assignment, pause approvals, bonus awards |
| `quality_engineer` | Quality reviews, SLA monitoring, bonus requests |

---

## 11. Frontend

See `frontend/` directory. The frontend is a pnpm monorepo:

```bash
cd frontend

# Install dependencies
pnpm install

# Run web app (development)
pnpm --filter @inspection/web dev

# Run mobile app (Expo)
pnpm --filter @inspection/mobile start
```
