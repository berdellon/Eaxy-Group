# ---------- Dockerfile definitivo para Render ----------
FROM python:3.11-slim

# Carpeta de trabajo
WORKDIR /app

# Copiar dependencias e instalarlas
COPY ./backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copiar todo el proyecto
COPY . /app

# Configuración de entorno
ENV FLASK_APP=backend/app.py
ENV PYTHONUNBUFFERED=1
EXPOSE 5000

# Crear script para esperar la base de datos antes de arrancar Gunicorn
RUN echo '#!/usr/bin/env bash\n\
set -e\n\
RETRIES=${DB_WAIT_RETRIES:-20}\n\
SLEEP=${DB_WAIT_SLEEP:-5}\n\
echo "🔄 Esperando conexión con la base de datos..."\n\
for ((i=1;i<=RETRIES;i++)); do\n\
  python - <<PY\n\
import os, sys\n\
from sqlalchemy import create_engine, text\n\
url = os.getenv("DATABASE_URL")\n\
if not url:\n\
    sys.exit(1)\n\
if "sslmode" not in url and url.startswith("postgres://"):\n\
    url += "?sslmode=require"\n\
try:\n\
    e = create_engine(url, connect_args={})\n\
    with e.connect() as conn:\n\
        conn.execute(text("SELECT 1"))\n\
    print("✅ DB accesible")\n\
except Exception as e:\n\
    print("Intento fallido:", e)\n\
    sys.exit(1)\n\
PY\n\
  if [ $? -eq 0 ]; then\n\
    echo "✅ Conexión establecida con la base de datos"\n\
    break\n\
  fi\n\
  echo "⚠️  Intento $i/$RETRIES fallido, reintentando en $SLEEP s..."\n\
  sleep $SLEEP\n\
done\n\
if [ $i -eq $RETRIES ]; then\n\
  echo "❌ No se pudo conectar a la base de datos tras $RETRIES intentos"\n\
  exit 1\n\
fi\n\
# Crear tablas si no existen\n\
python - <<PY\n\
from backend.app import db, app\n\
with app.app_context():\n\
    db.create_all()\n\
    print("🗄️  Tablas creadas o verificadas")\n\
PY\n\
# Lanzar Gunicorn\n\
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --timeout 120 "backend.app:app" --workers 2 --threads 4\n' > /app/wait_for_db.sh

# Hacer el script ejecutable
RUN chmod +x /app/wait_for_db.sh

# Comando final: ejecutar script de espera y luego iniciar Gunicorn
CMD ["/bin/bash", "-lc", "/app/wait_for_db.sh"]
