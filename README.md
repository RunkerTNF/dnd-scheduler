# DnD Scheduler

Веб-приложение для планирования сессий Dungeons & Dragons. Игроки отмечают доступные даты в календаре, а Game Master назначает игры на основе пересечений.

## Возможности

- Регистрация / авторизация (email + Google OAuth)
- Создание групп и приглашение игроков по ссылке
- Календарь с отметками доступности (клик / драг по дням)
- Автоматический подбор дат (пересечение расписаний участников)
- Назначение и отмена игровых сессий (Game Master)
- Профиль пользователя: имя, аватарка (загрузка файла или URL), смена пароля

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 3, React Router, TanStack Query, Zustand, react-big-calendar, Headless UI |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, JWT (python-jose), bcrypt, uv |
| Инфра | Docker, Docker Compose, Nginx |

## Структура проекта

```
dnd_scheduler/
├── .docker/                  # Docker Compose файлы
│   ├── docker-compose.yml    # Dev: frontend + backend + db + pgAdmin + backup
│   └── docker-compose.prod.yml  # Prod: frontend + backend (внешняя БД)
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI приложение
│   │   ├── models.py         # SQLAlchemy модели
│   │   ├── schemas.py        # Pydantic схемы
│   │   ├── routers/          # API роутеры (auth, groups, users, availability, events, join)
│   │   ├── auth.py           # JWT, хеширование паролей
│   │   ├── config.py         # Настройки из .env
│   │   └── database.py       # Подключение к БД
│   ├── migrations/           # Alembic миграции
│   ├── uploads/              # Загруженные файлы (аватарки)
│   ├── Dockerfile
│   ├── pyproject.toml        # Зависимости (источник истины для uv)
│   └── requirements.txt      # Замороженные зависимости для Docker (uv export)
├── frontend/
│   ├── src/
│   │   ├── api/              # Axios клиенты (auth, groups, events, availability, users)
│   │   ├── components/       # UI компоненты (Button, Input, Modal, Calendar, Sidebar)
│   │   ├── pages/            # Страницы (Login, Register, Groups, GroupDetail, Profile, Join)
│   │   ├── store/            # Zustand (authStore)
│   │   ├── utils/            # Утилиты (colorHelpers, imageUrl)
│   │   ├── types/            # TypeScript типы
│   │   └── router.tsx        # Маршруты
│   ├── Dockerfile
│   ├── nginx.conf            # Nginx конфиг (SPA + проксирование API)
│   └── package.json
├── .env                      # Переменные окружения (не в git)
└── README.md
```

## Локальный запуск

### Вариант 1: Docker Compose (всё в контейнерах)

1. Создайте `.env` в корне проекта:

   ```env
   # PostgreSQL
   POSTGRES_USER=app
   POSTGRES_PASSWORD=app
   POSTGRES_DB=dnd
   POSTGRES_HOST=db

   # Backend
   DATABASE_URL="postgresql+psycopg://app:app@db:5432/dnd"
   CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
   SECRET_KEY="<случайная_строка>"   # openssl rand -hex 32
   ACCESS_TOKEN_EXPIRE_MINUTES=1440
   GOOGLE_CLIENT_ID="<client_id>"    # опционально

   # pgAdmin (опционально)
   PGADMIN_EMAIL=admin@example.com
   PGADMIN_PASSWORD=admin
   PGADMIN_PORT=5050

   # Бэкапы (опционально, интервал в секундах, по умолчанию 86400 = 24 часа)
   BACKUP_INTERVAL=86400
   ```

2. Соберите и запустите:
   ```bash
   docker compose -f .docker/docker-compose.yml up --build -d
   ```

3. Примените миграции:
   ```bash
   docker compose -f .docker/docker-compose.yml exec backend alembic upgrade head
   ```

4. Откройте:
   - Frontend: `http://localhost:3000`
   - API Swagger: `http://localhost:8000/docs`
   - pgAdmin: `http://localhost:5050`

5. Для бэкапов БД (опционально):
   ```bash
   docker compose -f .docker/docker-compose.yml up -d db-backup
   ```

### Вариант 2: Локальная разработка (без Docker для frontend/backend)

1. Запустите БД через Docker:
   ```bash
   docker compose -f .docker/docker-compose.yml up -d db
   ```

2. Backend:
   ```bash
   cd backend
   uv sync                   # создаёт .venv, устанавливает зависимости, генерирует uv.lock
   uv run alembic upgrade head
   uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

   > **Обновление зависимостей**: редактируй `backend/pyproject.toml`, затем:
   > ```bash
   > uv lock
   > uv export --frozen --no-dev -o requirements.txt   # обновляет requirements.txt для Docker
   > ```

3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Создайте `frontend/.env`:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   VITE_GOOGLE_CLIENT_ID=<client_id>
   ```

5. Создайте `.env` в корне:
   ```env
   DATABASE_URL="postgresql+psycopg://app:app@localhost:5432/dnd"
   CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
   SECRET_KEY="<случайная_строка>"
   ACCESS_TOKEN_EXPIRE_MINUTES=1440
   GOOGLE_CLIENT_ID="<client_id>"
   ```

6. Откройте `http://localhost:5173`

## API Endpoints

### Auth
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход |
| POST | `/auth/google` | Google OAuth |
| POST | `/auth/logout` | Выход |

### Users
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/users/{id}` | Получить пользователя |
| PUT | `/users/me` | Обновить профиль (имя, аватарка) |
| POST | `/users/me/avatar` | Загрузить аватарку (файл) |
| POST | `/users/me/password` | Сменить пароль |

### Groups
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/groups` | Мои группы |
| POST | `/groups` | Создать группу |
| GET | `/groups/{id}` | Детали группы |
| DELETE | `/groups/{id}` | Удалить группу |
| POST | `/groups/{id}/invites` | Создать инвайт |
| DELETE | `/groups/{id}/invites/{invite_id}` | Удалить инвайт |
| DELETE | `/groups/{id}/members/{user_id}` | Удалить участника |

### Availability
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/groups/{id}/availability` | Все отметки доступности |
| POST | `/groups/{id}/availability` | Создать отметку |
| DELETE | `/groups/{id}/availability/{avail_id}` | Удалить отметку |
| GET | `/groups/{id}/availability/overlaps` | Пересечения (подбор дат) |

### Events
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/groups/{id}/events` | Все события |
| POST | `/groups/{id}/events` | Создать событие (GM) |
| PUT | `/groups/{id}/events/{event_id}` | Обновить событие (GM) |
| DELETE | `/groups/{id}/events/{event_id}` | Удалить событие (GM) |

### Join
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/join` | Присоединиться по токену |

## Продакшен

Для продакшена используйте `docker-compose.prod.yml` с внешней управляемой БД:

```bash
DATABASE_URL="postgresql+psycopg://user:password@host:5432/dbname?sslmode=require"
docker compose -f .docker/docker-compose.prod.yml up --build -d
```

Frontend раздаётся через Nginx на порту 80. API и загруженные файлы проксируются через `/api/` и `/uploads/`.

Загруженные файлы (аватарки) хранятся в Docker volume `uploads` и сохраняются между пересборками.

## Лицензия

MIT License.
