FROM python:3.11-slim
WORKDIR /app
COPY ./backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app
ENV FLASK_APP=backend/app.py
ENV PYTHONUNBUFFERED=1
EXPOSE 5000
CMD exec gunicorn --bind 0.0.0.0:${PORT:-5000} "backend.app:app" --workers 2 --threads 4
