FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app
ENV FLASK_APP=backend/app.py
EXPOSE 5000
CMD ["python3","backend/app.py"]
