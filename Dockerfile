FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

# 🔥 ESTE ES EL CAMBIO IMPORTANTE:
# Usamos gunicorn para producción
CMD ["gunicorn", "-b", "0.0.0.0:10000", "backend.app:app"]

