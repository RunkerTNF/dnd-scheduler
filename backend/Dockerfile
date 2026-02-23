FROM python:3.11-slim

# Копируем uv из официального образа
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем зависимости (кешируем слой отдельно от кода приложения)
COPY backend/requirements.txt ./requirements.txt
RUN uv pip install --system --no-cache -r requirements.txt

COPY backend /app/backend
WORKDIR /app/backend

# Директория для загрузок (аватарки и т.д.)
RUN mkdir -p /app/backend/uploads/avatars

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
