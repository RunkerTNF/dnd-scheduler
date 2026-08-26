# Production Docker Compose

Этот файл [docker-compose.prod.yml](docker-compose.prod.yml) содержит полную конфигурацию для продакшена.

## Структура

```yaml
services:
  frontend   # React + Nginx (порт 80)
  backend    # FastAPI (порт 8000)
  db         # PostgreSQL 15
  db-backup  # Автоматический бэкап каждые 24 часа
```

## Быстрый старт

```bash
# Создать .env файлы (см. ниже)
# Запустить
docker compose -f docker-compose.prod.yml up -d --build

# Проверить
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## Необходимые файлы

### 1. `.docker/.env`

```env
# ClientID публичный, попадает в сборку фронта
YANDEX_CLIENT_ID=your-yandex-client-id
```

### 2. `../.env` (корень проекта)

```env
# База данных
POSTGRES_USER=app
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=dnd

# Для внешней БД раскомментируйте:
# DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname

# JWT
SECRET_KEY=your-secret-key-generate-with-openssl
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS
CORS_ORIGINS=["http://scheduler.runker.ru"]

# Яндекс ID
# ClientID нужен и здесь: бэкенд обменивает код на токен и шлёт оба значения
YANDEX_CLIENT_ID=your-yandex-client-id
# Client secret используется только бэкендом, наружу не уходит
YANDEX_CLIENT_SECRET=your-yandex-client-secret

# Бэкапы (опционально)
BACKUP_INTERVAL=86400  # 24 часа
```

## Особенности конфигурации

### 🔒 Безопасность

- **БД не доступна снаружи** — порт 5432 не пробрасывается
- **Порты для тестов:** `80:80` и `8000:8000` — изменить на `127.0.0.1:...` после настройки nginx
- **Изолированная сеть:** все сервисы в `app-network`

### 💾 Персистентность данных

- **pgdata volume** — данные PostgreSQL
- **uploads volume** — загруженные файлы (аватары)
- **backups bind mount** — дампы БД в `../backups/`

### 🔄 Автоматические перезапуски

Все сервисы имеют `restart: unless-stopped` — автоматически стартуют после перезагрузки сервера.

### 📦 Бэкапы

Сервис `db-backup` создаёт дампы в формате:
- **Формат:** `db_YYYYMMDD_HHMMSS.dump`
- **Место:** `backups/` (относительно корня проекта)
- **Интервал:** каждые 24 часа (настраивается через `BACKUP_INTERVAL`)

## Использование с системным Nginx

После запуска контейнеров, настройте системный nginx:

```bash
# Скопировать конфигурацию
sudo cp nginx-host.conf /etc/nginx/sites-available/scheduler.runker.ru
sudo ln -s /etc/nginx/sites-available/scheduler.runker.ru /etc/nginx/sites-enabled/

# Проверить и перезагрузить
sudo nginx -t
sudo systemctl reload nginx
```

См. подробную инструкцию: [DEPLOYMENT-NGINX.md](../DEPLOYMENT-NGINX.md)

## После настройки nginx — закрыть прямой доступ

Измените порты в [docker-compose.prod.yml:14,33](docker-compose.prod.yml):

```yaml
frontend:
  ports:
    - "127.0.0.1:80:80"  # Доступен только с localhost

backend:
  ports:
    - "127.0.0.1:8000:8000"  # Доступен только с localhost
```

Перезапустите:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Полезные команды

```bash
# Alias для удобства
alias dcp='docker compose -f docker-compose.prod.yml'

# Управление
dcp up -d --build    # Запустить
dcp down             # Остановить
dcp restart          # Перезапустить
dcp ps               # Статус
dcp logs -f          # Все логи
dcp logs -f backend  # Конкретный сервис

# Вход в контейнер
dcp exec backend bash
dcp exec db psql -U app -d dnd

# Ручной бэкап
dcp exec db pg_dump -U app -d dnd -Fc > backups/manual_$(date +%Y%m%d_%H%M%S).dump

# Восстановление из бэкапа
dcp exec -T db pg_restore -U app -d dnd -c < backups/db_20260209_120000.dump

# Просмотр volumes
docker volume ls
docker volume inspect docker_pgdata

# Очистка
docker system prune -a  # Осторожно! Удалит неиспользуемые образы
```

## Мониторинг

```bash
# Логи бэкапов
dcp logs -f db-backup

# Размер volumes
docker system df -v

# Список бэкапов
ls -lh ../backups/

# Ресурсы контейнеров
docker stats
```

## Troubleshooting

### Backend не стартует

```bash
dcp logs backend
# Проверить DATABASE_URL в .env
# Проверить что db контейнер здоров
dcp ps
```

### БД не доступна

```bash
# Проверить health check
dcp ps
# Должно быть "healthy"

# Проверить логи
dcp logs db
```

### Бэкапы не создаются

```bash
# Проверить логи
dcp logs db-backup

# Проверить что папка доступна
ls -la ../backups/

# Создать вручную если нужно
mkdir -p ../backups
```

## Миграции БД

```bash
# Войти в backend контейнер
dcp exec backend bash

# Запустить миграции (если используете Alembic)
alembic upgrade head
```

## Обновление приложения

```bash
cd ~/apps/dnd_scheduler
git pull
cd .docker
dcp up -d --build
```

---

**Полная документация:** [DEPLOYMENT-NGINX.md](../DEPLOYMENT-NGINX.md)
