"""
Gunicorn configuration for production deployment.
Usage: gunicorn -c gunicorn.conf.py 'app:create_app("production")'
"""

import os
import multiprocessing

# Server socket
bind = os.getenv('GUNICORN_BIND', '0.0.0.0:5000')
backlog = 2048

# Worker processes
# Render starter (512MB) can only handle 1 worker due to heavy AI service imports.
# Override via GUNICORN_WORKERS env var if you upgrade to a bigger plan.
workers = int(os.getenv('GUNICORN_WORKERS', '1'))
worker_class = 'gthread'
# More threads compensate for fewer workers — async I/O bound work scales well with threads
threads = int(os.getenv('GUNICORN_THREADS', '8'))
worker_connections = 1000
timeout = 120
keepalive = 5

# Restart workers after this many requests (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = os.getenv('GUNICORN_ACCESS_LOG', '-')
errorlog = os.getenv('GUNICORN_ERROR_LOG', '-')
loglevel = os.getenv('GUNICORN_LOG_LEVEL', 'info')

# Process naming
proc_name = 'inspection-system'

# Preload app for faster worker startup
preload_app = True

# Graceful restart timeout
graceful_timeout = 30
