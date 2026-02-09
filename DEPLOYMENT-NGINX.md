# Деплой с системным Nginx

Инструкция по развертыванию приложения на домене **scheduler.runker.ru** с использованием системного nginx как reverse proxy.

## Архитектура

```
Браузер → Nginx (хост:80) → Frontend контейнер (localhost:80)
                          → Backend контейнер (localhost:8000)
```

## Предварительные требования

- Сервер с Ubuntu/Debian
- Установленные Docker и Docker Compose
- Управляемая база данных PostgreSQL
- DNS A-запись: `scheduler.runker.ru` → IP сервера

---

## Шаг 1: Подготовка сервера

```bash
# Подключиться к серверу
ssh user@157.22.231.200

# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker (если не установлен)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установить Nginx
sudo apt install nginx -y

# Проверить статус
sudo systemctl status nginx
```

---

## Шаг 2: Клонирование репозитория

```bash
# Создать директорию для проекта
mkdir -p ~/apps
cd ~/apps

# Клонировать репозиторий
git clone <YOUR_REPO_URL> dnd_scheduler
cd dnd_scheduler
```

---

## Шаг 3: Настройка переменных окружения

### Основной .env файл

```bash
nano .env
```

**Содержимое:**

```env
# База данных
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Секретный ключ (сгенерировать новый!)
SECRET_KEY=your-secret-key-here

# CORS Origins (важно указать ваш домен!)
CORS_ORIGINS=["http://scheduler.runker.ru"]

# JWT токен - время жизни
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Google OAuth
GOOGLE_CLIENT_ID=687642829824-dng38rnpks9q2pr3tecfb30e2lku0f2b.apps.googleusercontent.com

# PostgreSQL (для dev/локальной БД, если нужно)
POSTGRES_USER=app
POSTGRES_PASSWORD=app
POSTGRES_DB=dnd
```

**Генерация SECRET_KEY:**
```bash
openssl rand -base64 32
```

### Docker .env файл

```bash
nano .docker/.env
```

**Содержимое:**

```env
GOOGLE_CLIENT_ID=687642829824-dng38rnpks9q2pr3tecfb30e2lku0f2b.apps.googleusercontent.com
```

---

## Шаг 4: Настройка системного Nginx

### 4.1 Создать конфигурацию для домена

```bash
# Скопировать конфиг из репозитория
sudo cp .docker/nginx-host.conf /etc/nginx/sites-available/scheduler.runker.ru

# Создать симлинк
sudo ln -s /etc/nginx/sites-available/scheduler.runker.ru /etc/nginx/sites-enabled/

# Удалить дефолтный конфиг (если мешает)
sudo rm /etc/nginx/sites-enabled/default
```

### 4.2 Проверить конфигурацию

```bash
sudo nginx -t
```

Если всё ОК, перезагрузить nginx:

```bash
sudo systemctl reload nginx
```

---

## Шаг 5: Запуск контейнеров

```bash
cd .docker

# Собрать и запустить контейнеры (production версия)
docker compose -f docker-compose.prod.yml up -d --build

# Проверить статус
docker compose -f docker-compose.prod.yml ps

# Посмотреть логи
docker compose -f docker-compose.prod.yml logs -f

# Только логи определённого сервиса
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f db-backup
```

---

## Шаг 6: Проверка работы

### Проверка локально на сервере

```bash
# Frontend контейнер
curl -I http://localhost:80

# Backend контейнер
curl http://localhost:8000/health

# Через системный nginx
curl -I http://localhost
```

### Проверка в браузере

Откройте: **http://scheduler.runker.ru**

---

## Шаг 7: Настройка файрвола (UFW)

```bash
# Разрешить HTTP
sudo ufw allow 80/tcp

# Разрешить HTTPS (для будущего)
sudo ufw allow 443/tcp

# Разрешить SSH (если еще не разрешен)
sudo ufw allow 22/tcp

# Включить файрвол
sudo ufw enable

# Проверить статус
sudo ufw status
```

---

## Troubleshooting

### Проблема: 502 Bad Gateway

**Причина:** Контейнеры не запущены или недоступны.

```bash
# Проверить контейнеры
docker compose ps

# Проверить логи
docker compose logs backend
docker compose logs frontend

# Проверить доступность портов
curl http://localhost:80
curl http://localhost:8000/health
```

### Проблема: Nginx ошибка конфигурации

```bash
# Проверить конфиг
sudo nginx -t

# Посмотреть логи
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/scheduler_access.log
```

### Проблема: CORS ошибки

Убедитесь, что в `.env` указан правильный домен:

```env
CORS_ORIGINS=["http://scheduler.runker.ru"]
```

После изменения перезапустите backend:

```bash
docker compose restart backend
```

### Проблема: Google OAuth не работает

1. Проверьте `.docker/.env` - должен быть `GOOGLE_CLIENT_ID`
2. В Google Cloud Console добавьте в **Authorized JavaScript origins**:
   - `http://scheduler.runker.ru`

---

## Полезные команды

```bash
# Для краткости создадим alias
alias dcp='docker compose -f docker-compose.prod.yml'

# Остановить контейнеры
dcp down

# Перезапустить
dcp restart

# Перезапустить конкретный сервис
dcp restart backend

# Пересобрать и запустить
dcp up -d --build

# Посмотреть логи конкретного сервиса
dcp logs -f backend
dcp logs -f db-backup

# Посмотреть статус
dcp ps

# Войти в контейнер
dcp exec backend bash
dcp exec db psql -U app -d dnd

# Перезагрузить nginx
sudo systemctl reload nginx

# Проверить статус nginx
sudo systemctl status nginx

# Обновить приложение
cd ~/apps/dnd_scheduler
git pull
cd .docker
dcp up -d --build
```

---

## Следующие шаги: HTTPS с Let's Encrypt

После того, как всё заработает на HTTP, настроим HTTPS:

```bash
# Установить Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получить сертификат
sudo certbot --nginx -d scheduler.runker.ru

# Certbot автоматически обновит конфигурацию nginx
```

---

## Оптимизация для продакшена

### Закрыть прямой доступ к контейнерам

После того как всё заработает, измените в `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "127.0.0.1:8080:80"  # Вместо "80:80"

backend:
  ports:
    - "127.0.0.1:8000:8000"  # Вместо "8000:8000"
```

Это сделает контейнеры доступными только с localhost, через nginx.

### Отключить pgAdmin в продакшене

Закомментируйте или удалите секцию `pgadmin` в `docker-compose.yml` для безопасности.

---

## Мониторинг

```bash
# Логи nginx
sudo tail -f /var/log/nginx/scheduler_access.log
sudo tail -f /var/log/nginx/scheduler_error.log

# Логи Docker
docker compose logs -f --tail=100

# Статус системы
docker compose ps
sudo systemctl status nginx
```
