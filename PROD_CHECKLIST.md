# Production Deployment Checklist

Use this checklist before every production deployment. All items must be verified.

---

## Secrets & Environment

- [ ] `SECRET_KEY` set to a cryptographically random string (min 32 bytes)
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
- [ ] `JWT_SECRET_KEY` set to a different random string from `SECRET_KEY`
- [ ] `DATABASE_URL` points to production PostgreSQL (not SQLite)
- [ ] `OPENAI_API_KEY` set if auto-translation is needed (optional)
- [ ] `.env` file is **not** committed to version control
- [ ] No dev defaults (`dev-secret-key-change-in-production`) remain in environment

## Database

- [ ] PostgreSQL 16+ is running and accessible
- [ ] Database user has appropriate permissions (not superuser)
- [ ] Connection string uses SSL: `?sslmode=require` (if remote DB)
- [ ] `flask db upgrade` has been run after deployment
- [ ] Pool settings are appropriate:
  - `DB_POOL_SIZE` default: 10 (increase for high concurrency)
  - `pool_pre_ping: True` is enabled (auto-reconnect)
  - `pool_recycle: 3600` prevents stale connections
  - `max_overflow: 5` allows burst capacity
- [ ] Automated database backups are configured
- [ ] Backup restore has been tested at least once

## Web Server

- [ ] Gunicorn is the WSGI server (not Flask dev server)
- [ ] `FLASK_ENV=production` is set
- [ ] Worker count is appropriate: `GUNICORN_WORKERS` (default: `CPU*2+1`)
- [ ] Request timeout is set: 120s default
- [ ] `max_requests=1000` is enabled (prevents memory leaks)
- [ ] Process is managed by systemd/supervisor/Docker (auto-restart on crash)
- [ ] Application starts without errors: check `docker compose logs api`

## CORS

- [ ] `CORS_ORIGINS` is set to specific domain(s), **not** `*`
  ```
  CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
  ```
- [ ] No warning in logs: `"CORS_ORIGINS not set — defaulting to '*'"`

## Rate Limiting

- [ ] Redis is running and accessible
- [ ] `REDIS_URL` / `RATELIMIT_STORAGE_URI` points to Redis (not `memory://`)
  - `memory://` does not share state across Gunicorn workers
- [ ] Global default: 200 requests/minute per IP
- [ ] File upload: 10 requests/minute
- [ ] Batch upload: 5 requests/minute
- [ ] Login: 5 requests/minute
- [ ] Token refresh: 10 requests/minute

## SSL / HTTPS

- [ ] TLS certificate is installed (Let's Encrypt or purchased)
- [ ] HTTP redirects to HTTPS (via reverse proxy)
- [ ] `SESSION_COOKIE_SECURE = True` (set automatically in production config)
- [ ] `JWT_COOKIE_SECURE = True` (set automatically in production config)

## Reverse Proxy

- [ ] Nginx/Caddy/ALB is configured in front of Gunicorn
- [ ] Proxy passes `X-Forwarded-For` and `X-Forwarded-Proto` headers
- [ ] Static file serving is handled by the proxy (not Gunicorn)
- [ ] Upload size limit matches `MAX_CONTENT_LENGTH` (16 MB)
- [ ] WebSocket/long-poll timeout >= Gunicorn timeout (120s)

## File Uploads

- [ ] `UPLOAD_FOLDER` directory exists and is writable by the app user
- [ ] Upload directory is on persistent storage (Docker volume or host mount)
- [ ] Allowed extensions are restricted: `png, jpg, jpeg, gif, webp, pdf`
- [ ] Max file size: 16 MB (configurable via `MAX_CONTENT_LENGTH`)
- [ ] Uploaded files are served with correct MIME types

## Logging

- [ ] `LOG_LEVEL` is set to `INFO` (not `DEBUG` in production)
- [ ] `LOG_FILE` path is writable and on persistent storage
- [ ] Log rotation is configured: 10 MB per file, 5 backup files (built-in)
- [ ] Gunicorn access/error logs are captured:
  - `GUNICORN_ACCESS_LOG` — stdout by default
  - `GUNICORN_ERROR_LOG` — stdout by default
- [ ] Logs are aggregated to a central system (CloudWatch, ELK, etc.)

## Background Scheduler

- [ ] Scheduler starts automatically with the app (non-testing mode)
- [ ] 6 scheduled tasks are registered (check logs for "Background scheduler started")
- [ ] With multiple Gunicorn workers, only ONE runs the scheduler
  - Current setup: `preload_app = True` — scheduler starts once in master process
  - If issues arise, consider running scheduler in a separate process

## Monitoring

- [ ] Health check endpoint is monitored: `GET /health`
  - Returns `200` when healthy, `503` when DB unreachable
- [ ] Alerts configured for:
  - Health check failures (503 responses)
  - High error rate (5xx responses)
  - High response latency (>5s)
  - Disk space on upload/log volumes
  - Database connection pool exhaustion

## Security

- [ ] App runs as non-root user (`appuser` in Docker)
- [ ] No default passwords remain in the system
- [ ] JWT tokens expire: 8 hours access (production), 7 days refresh
- [ ] Token blocklist is functional (revoked tokens are rejected)
- [ ] Admin-only endpoints enforce role checks
- [ ] File upload validates MIME type, not just extension
- [ ] SQL injection protection: SQLAlchemy ORM used throughout (no raw SQL in API layer)
- [ ] No sensitive data in error responses (production error handlers return generic messages)

## Docker-Specific

- [ ] `docker compose up -d --build` succeeds without errors
- [ ] PostgreSQL healthcheck passes before API starts (`depends_on: condition: service_healthy`)
- [ ] Named volumes are used for `pgdata`, `uploads`, `logs`
- [ ] Container restarts on failure (`restart: unless-stopped`)
- [ ] Docker image does not contain `.env`, `.git`, or test files
  - Add `.dockerignore` if not present

## Post-Deploy Verification

- [ ] `curl https://yourdomain.com/health` returns `{"status": "healthy"}`
- [ ] Login works: `POST /api/auth/login` returns tokens
- [ ] Role-based access works: admin can list users, non-admin cannot
- [ ] File upload works: `POST /api/files/upload` accepts an image
- [ ] Notifications are created on key events (defect creation, job completion)
- [ ] Scheduler logs show tasks running at expected intervals
- [ ] Error responses do not leak stack traces or internal paths
