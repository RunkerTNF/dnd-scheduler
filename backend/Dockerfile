FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
WORKDIR /app/backend

# Директория для загрузок (аватарки и т.д.)
RUN mkdir -p /app/backend/uploads/avatars

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
