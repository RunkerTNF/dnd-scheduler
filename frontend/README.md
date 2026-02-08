# DnD Scheduler — Frontend

React SPA для планирования D&D сессий.

## Разработка

```bash
npm install
npm run dev        # Dev-сервер на http://localhost:5173
npm run build      # Сборка для продакшена
npm run lint       # Линтинг
```

## Переменные окружения

Создайте `.env` в папке `frontend/`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=<client_id>
```

## Docker

При сборке через Docker (`frontend/Dockerfile`):
- Используется multi-stage build: Node для сборки, Nginx для раздачи
- `VITE_API_BASE_URL` по умолчанию пустой (API проксируется через Nginx)
- Nginx конфиг (`nginx.conf`): SPA fallback, проксирование `/api/` и `/uploads/` на backend
