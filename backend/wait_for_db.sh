#!/usr/bin/env bash
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "No DATABASE_URL defined, starting app (local mode)."
  exec python backend/app.py
fi
echo "Waiting for DB..."
RETRIES=${DB_WAIT_RETRIES:-20}
SLEEP=${DB_WAIT_SLEEP:-5}
count=0
while [ $count -lt $RETRIES ]; do
  python - <<PY
import os,sys
from sqlalchemy import create_engine, text
url = os.getenv('DATABASE_URL', '')
if url.startswith('postgres://') and 'sslmode' not in url:
    url = url + '?sslmode=require'
try:
    e = create_engine(url)
    with e.connect() as conn:
        conn.execute(text('SELECT 1'))
    sys.exit(0)
except Exception as e:
    sys.exit(1)
PY
  if [ $? -eq 0 ]; then
    break
  fi
  count=$((count+1))
  echo "Attempt $count failed, sleeping $SLEEP..."
  sleep $SLEEP
done
if [ $count -ge $RETRIES ]; then
  echo "DB not available after retries"
  exit 1
fi
python - <<PY
from backend.app import db, app
with app.app_context():
    db.create_all()
    print('Tables ensured')
PY
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --timeout 120 "backend.app:app" 
--workers 2 --threads 4
