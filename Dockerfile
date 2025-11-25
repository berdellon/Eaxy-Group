FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

# Render usa la variable de entorno PORT automáticamente.
ENV PORT=10000

CMD ["gunicorn", "backend.app:app", "-b", "0.0.0.0:${PORT}", "--timeout", "120"]
