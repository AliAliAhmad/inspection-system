#!/bin/bash
set -e

# Fix Render's postgres:// URI scheme for SQLAlchemy 2.x
if [ -n "$DATABASE_URL" ]; then
  export DATABASE_URL="${DATABASE_URL/postgres:\/\//postgresql:\/\/}"
fi

# Set FLASK_APP for CLI commands
export FLASK_APP="app:create_app('production')"

echo "Running database migrations..."
flask db upgrade

echo "Starting gunicorn..."
exec gunicorn -c gunicorn.conf.py "app:create_app('production')"
