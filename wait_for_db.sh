#!/usr/bin/env bash
set -e

# Intentos y retraso entre intentos
RETRIES=${DB_WAIT_RETRIES:-20}
SLEEP=${DB_WAIT_SLEEP:-5}

# Usa DATABASE_URL (entero) si está disponible, si no salta inmediatamente
if [ -z "$DATABASE_URL" ]; then
  echo "No hay DATABASE_URL establecido: saliendo (modo local?)"
  exit 0
fi

echo "Esperando a que la base de datos responda... (DATABASE_URL=$DATABASE_URL)"

# Extraer host y puerto de DATABASE_URL (soporta postgresql://user:pass@host:port/db)
# Si no podemos parsear, hacemos intentos de resolución DNS simple con host/pg_isready.
# Reintentos:
count=0
while [ $count -lt $RETRIES ]; do
  # Intento simple con pg_isready si está disponible
  if command -v pg_isready >/dev/null 2>&1; then
    # extraer host y puerto
    # usar python para parsear si está disponible
    host=$(python - <<PY
import os,sys
from urllib.parse import urlparse
u=os.getenv('DATABASE_URL','')
if u:
  p=urlparse(u)
  print(p.hostname or '')
PY
) || host=""

    port=$(python - <<PY
import os,sys
from urllib.parse import urlparse
u=os.getenv('DATABASE_URL','')
if u:
  p=urlparse(u)
  print(p.port or '')
PY
) || port=""

    if [ -z "$host" ]; then
      echo "No se pudo extraer host de DATABASE_URL; intento simple de conexión con SQLAlchemy via python"
      # intentar conexión con tiny script Python
      python - <<PY
import os
from sqlalchemy import create_engine, text
try:
    e=create_engine(os.environ['DATABASE_URL'], connect_args={})
    with e.connect() as conn:
        conn.execute(text('SELECT 1'))
    print('OK')
except Exception as e:
    raise SystemExit(1)
PY
      rc=$?
      if [ $rc -eq 0 ]; then
        echo "DB accesible (python)."
        exit 0
      fi
    else
      echo "Comprobando pg_isready en $host ${port:-5432}..."
      if pg_isready -h "$host" -p "${port:-5432}" >/dev/null 2>&1; then
        echo "pg_isready ok"
        exit 0
      fi
    fi
  else
    # fallback: usar python para intentar conectar con SQLAlchemy
    python - <<PY
import os,sys
from sqlalchemy import create_engine, text
try:
    e=create_engine(os.environ['DATABASE_URL'], connect_args={})
    with e.connect() as conn:
        conn.execute(text('SELECT 1'))
    print('OK')
except Exception as e:
    sys.exit(1)
PY
    if [ $? -eq 0 ]; then
      echo "DB accesible (python fallback)."
      exit 0
    fi
  fi

  count=$((count+1))
  echo "Intento $count/$RETRIES fallido. Esperando $SLEEP s..."
  sleep $SLEEP
done

echo "ERROR: no se pudo conectar a la base de datos tras $RETRIES intentos."
exit 1
