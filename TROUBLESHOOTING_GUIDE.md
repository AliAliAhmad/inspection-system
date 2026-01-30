# Troubleshooting Guide

Common issues and their solutions for the Industrial Inspection System.

---

## Startup Errors

### `RuntimeError: Missing required environment variables`

**Cause:** Production mode requires `SECRET_KEY`, `JWT_SECRET_KEY`, and `DATABASE_URL`.

**Fix:**
```bash
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export DATABASE_URL=postgresql://user:pass@host:5432/inspection
```

Or add them to your `.env` file.

### `ModuleNotFoundError: No module named 'app'`

**Cause:** Running from the wrong directory or virtual environment not activated.

**Fix:**
```bash
cd /path/to/inspection_system
source venv/bin/activate
python run.py
```

### `sqlalchemy.exc.OperationalError: could not connect to server`

**Cause:** PostgreSQL is not running or connection string is wrong.

**Fix:**
1. Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
2. Check `DATABASE_URL` format: `postgresql://user:password@host:port/dbname`
3. For Docker: ensure the `db` service is healthy: `docker compose ps`

---

## Database Issues

### `alembic.util.exc.CommandError: Can't locate revision`

**Cause:** Migration history is out of sync.

**Fix:**
```bash
# Check current revision
flask db current

# Show full history
flask db history

# If needed, stamp to a known state and re-migrate
flask db stamp head
flask db migrate -m "fix migration state"
flask db upgrade
```

### `IntegrityError: duplicate key value violates unique constraint`

**Cause:** Attempting to insert a record with a duplicate unique field (email, serial number, etc.).

**Fix:** Check the request data for duplicates. Common unique fields:
- `User.email`
- `Equipment.serial_number`
- `SpecialistJob.job_id`
- `EngineerJob.job_id`

### `Database commit failed -- rolled back` (in logs)

**Cause:** A `safe_commit()` call caught an exception and rolled back the transaction.

**Fix:** Check the full stack trace in the log file (`instance/logs/app.log`). Common causes:
- Foreign key constraint violation (referencing a deleted record)
- NOT NULL violation (missing required field)
- Unique constraint violation

### Connection pool exhaustion

**Symptoms:** Requests hang or timeout; logs show `QueuePool limit` errors.

**Fix:**
```bash
# Increase pool size (default: 10)
export DB_POOL_SIZE=20
```

Also check for uncommitted transactions or long-running queries.

---

## Authentication / JWT Issues

### `401: Token has expired`

**Cause:** Access token has expired (8 hours in production, 24 hours in dev).

**Fix:** Use the refresh token to get a new access token:
```bash
curl -X POST /api/auth/refresh \
  -H "Authorization: Bearer <refresh_token>"
```

### `401: Invalid token`

**Cause:** Token is malformed, signed with a different secret, or corrupted.

**Fix:**
- Verify `JWT_SECRET_KEY` hasn't changed between token issuance and validation
- Re-login to get fresh tokens
- Check that the `Authorization` header format is `Bearer <token>` (with a space)

### `401: Token has been revoked`

**Cause:** The token was explicitly logged out (added to blocklist).

**Fix:** Re-login. This is expected behavior after calling `POST /api/auth/logout`.

### `401: Authorization token required`

**Cause:** No `Authorization` header in the request.

**Fix:** Add the header:
```
Authorization: Bearer <your_access_token>
```

---

## Rate Limiting

### `429: Too many requests`

**Cause:** Client exceeded the rate limit for an endpoint.

**Default limits:**
| Endpoint | Limit |
|----------|-------|
| Global default | 200/minute |
| `POST /api/auth/login` | 5/minute |
| `POST /api/auth/refresh` | 10/minute |
| `POST /api/files/upload` | 10/minute |
| `POST /api/files/upload-multiple` | 5/minute |
| `POST /api/bonus-stars/award` | 20/minute |
| `POST /api/bonus-stars/request` | 20/minute |
| `POST /api/engineer-jobs` | 20/minute |

**Fix:**
- Wait for the rate limit window to reset (1 minute)
- If using `memory://` storage with multiple Gunicorn workers, each worker tracks limits independently — switch to Redis for shared state

### Rate limits not enforced across workers

**Cause:** Using `memory://` storage backend with multiple Gunicorn workers.

**Fix:** Set Redis as the storage backend:
```bash
export RATELIMIT_STORAGE_URI=redis://localhost:6379/0
```

---

## File Upload Issues

### `413: Request Entity Too Large`

**Cause:** File exceeds the 16 MB limit.

**Fix:** Compress the file or increase the limit:
```python
# In config.py or via env var
MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32 MB
```

Also update the reverse proxy (Nginx `client_max_body_size`).

### `400: File type not allowed`

**Cause:** File extension is not in the allowed list.

**Allowed extensions:** `png`, `jpg`, `jpeg`, `gif`, `webp`, `pdf`

**Fix:** Convert the file to an allowed format, or extend `ALLOWED_EXTENSIONS` in config.

### Uploaded files disappear after container restart

**Cause:** Upload directory is not on a persistent volume.

**Fix:** Ensure Docker volume is mounted:
```yaml
volumes:
  - uploads:/app/instance/uploads
```

---

## CORS Errors

### `Access-Control-Allow-Origin` header missing

**Cause:** The requesting origin is not in `CORS_ORIGINS`.

**Fix:**
```bash
# Single origin
export CORS_ORIGINS=https://yourdomain.com

# Multiple origins
export CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# All origins (dev only)
export CORS_ORIGINS=*
```

### Warning: `CORS_ORIGINS not set -- defaulting to '*'`

**Cause:** `CORS_ORIGINS` is not set in a non-debug, non-testing environment.

**Fix:** Set `CORS_ORIGINS` to your actual frontend domain(s).

---

## Background Scheduler

### Scheduler not starting

**Cause:** Running in testing mode (`FLASK_ENV=testing`) or app failed to initialize.

**Fix:**
1. Verify `FLASK_ENV` is not `testing`
2. Check startup logs for: `"Background scheduler started with 6 scheduled jobs"`
3. If using Docker: `docker compose logs api | grep scheduler`

### Duplicate scheduled task execution

**Cause:** Multiple processes each started their own scheduler instance.

**Fix:** With Gunicorn + `preload_app = True` (default), the scheduler runs once in the master process. If you're seeing duplicates:
1. Verify `preload_app = True` in `gunicorn.conf.py`
2. Alternatively, run the scheduler as a separate process and disable it in the web workers

### Tasks not running at expected times

**Cause:** Server timezone differs from expected timezone.

**Fix:** APScheduler uses the server's local time. Scheduled times:
- 00:15 — Activate starting leaves
- 00:30 — Check expired leaves
- 13:00 — Generate daily inspection lists
- Every 1h — Check backlog
- Every 4h — Monitor QE SLA
- Every 6h — Detect stalled jobs

Set the server timezone or adjust cron triggers if needed.

---

## Health Check

### `GET /health` returns 503

**Response:**
```json
{
  "status": "degraded",
  "database": "unreachable"
}
```

**Cause:** The application cannot reach the database.

**Fix:**
1. Check PostgreSQL is running: `pg_isready`
2. Check `DATABASE_URL` is correct
3. Check network connectivity (especially in Docker: ensure `db` service is on the same network)
4. Check connection pool: may be exhausted under heavy load

### `GET /health` returns 200 but app is slow

**Cause:** Health check only verifies DB connectivity with `SELECT 1`. It does not check application-level issues.

**Investigate:**
- Check Gunicorn worker utilization
- Check database query performance
- Check for lock contention in PostgreSQL
- Review `instance/logs/app.log` for errors

---

## Common API Errors

### `403: Only admins can ...`

**Cause:** A non-admin user is attempting an admin-only action.

**Fix:** Log in as an admin user. Admin-only actions include:
- User CRUD
- Equipment CRUD
- Checklist template management
- Defect updates and closures
- Leave approvals
- Bonus approvals
- Schedule management

### `404: Resource not found`

**Cause:** The requested ID does not exist in the database.

**Fix:** Verify the ID is correct. Check if the record was soft-deleted (equipment set to `out_of_service`).

### `422: Unprocessable entity`

**Cause:** Request body is malformed or missing required fields.

**Fix:** Check the API expects JSON with `Content-Type: application/json` and all required fields are present.

### `500: Internal server error`

**Cause:** Unhandled exception in the application.

**Fix:** Check the log file for the full stack trace:
```bash
# Local
cat instance/logs/app.log | tail -50

# Docker
docker compose logs api --tail 50
```

---

## Performance

### Slow queries

**Symptoms:** High response latency, database CPU usage high.

**Investigate:**
```sql
-- PostgreSQL: find slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

Common causes:
- Missing database indexes (check migration files for index creation)
- Large result sets without pagination
- N+1 query patterns in list endpoints

### High memory usage

**Symptoms:** Workers being killed by OOM, `max_requests` triggering frequently.

**Fix:**
- Reduce `GUNICORN_WORKERS` count
- Ensure `max_requests = 1000` is set (auto-restarts workers)
- Check for large file uploads being held in memory
- Monitor with `docker stats` or system tools

---

## Docker-Specific

### `api` container keeps restarting

**Fix:**
```bash
# Check exit reason
docker compose logs api --tail 100

# Common causes:
# - Missing env vars (SECRET_KEY, JWT_SECRET_KEY, DATABASE_URL)
# - Database not ready (should be handled by healthcheck dependency)
# - Port conflict (5000 already in use)
```

### Database migrations not applied

**Fix:**
```bash
# Run migrations inside the running container
docker compose exec api flask db upgrade
```

### Cannot connect to database from API container

**Fix:**
- Ensure both services are in the same Docker network (default with compose)
- Use the service name as hostname: `postgresql://user:pass@db:5432/inspection`
- Check that the `db` service healthcheck passes: `docker compose ps`
