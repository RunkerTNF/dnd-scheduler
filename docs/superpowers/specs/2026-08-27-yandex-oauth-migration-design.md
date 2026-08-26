# Миграция с Google OAuth на Яндекс ID

**Дата:** 2026-08-27
**Статус:** утверждён

## Контекст и цель

По требованиям российского законодательства авторизация через иностранного
провайдера должна быть отключена. Вместо Google — Яндекс ID.

Сложность миграции в том, что в базе Google-юзеры отличимы ровно одним
признаком: `User.passwordHash IS NULL`. Отдельной таблицы провайдеров нет.
Почта у них почти всегда `@gmail.com`, а Яндекс ID отдаёт `default_email` вида
`@yandex.ru` — то есть автоматически переехать на новый провайдер по совпадению
почты большинство не сможет. При этом флоу восстановления пароля в проекте нет
вообще: смена пароля в профиле требует текущий, а у беспарольных его нет.
После отключения Google такие пользователи окажутся заперты снаружи, пока им не
выдадут путь установки пароля.

## Утверждённые решения

| Вопрос | Решение |
| --- | --- |
| Судьба Google | Убираем сразу, одним релизом: ручка, кнопка, зависимости |
| Путь для беспарольных | Полноценный сброс пароля плюс разовая рассылка персональных ссылок |
| Flow Яндекса | Authorization code, обмен кода на бэкенде — client_secret не покидает сервер |
| Связка аккаунтов | По `default_email`, как было с Google; таблицу привязок не заводим |
| Механика рассылки | Одноразовый CLI-скрипт с `--dry-run` |

## Область работ

### 1. Удаление Google

Backend:

- `app/auth.py` — функция `verify_google_identity_token`, импорты
  `google.auth.transport.requests` и `google.oauth2.id_token`
- `app/routers/auth.py` — ручка `POST /api/auth/google`
- `app/schemas.py` — `GoogleAuthRequestSchema`
- `app/config.py` — поле `google_client_id`
- `pyproject.toml` — зависимости `google-auth` и `requests`. Прямых импортов
  `requests` в `app/` нет, он стоял ради google-auth transport, так что уходит
  вместе с ним
- `app/routers/users.py:79` — текст ошибки «Аккаунт создан через Google, пароль
  не установлен» заменить на нейтральный, отсылающий к восстановлению пароля

Frontend:

- `src/components/auth/GoogleLoginButton.tsx` — удалить
- `src/main.tsx` — `GoogleOAuthProvider`, чтение `VITE_GOOGLE_CLIENT_ID`,
  отладочный `console.log`
- `package.json` — `@react-oauth/google`
- `src/api/auth.ts` — метод `googleAuth`
- `src/types/api.ts` — `GoogleAuthRequest`
- `src/pages/auth/LoginPage.tsx`, `src/pages/auth/RegisterPage.tsx` — импорт и
  вставка кнопки

Инфраструктура:

- `.docker/docker-compose.yml:10` и `.docker/docker-compose.prod.yml:11` —
  build-arg `VITE_GOOGLE_CLIENT_ID`
- `.env`, `README.md`, `frontend/README.md`, `.docker/README-PROD.md`,
  `DEPLOYMENT-NGINX.md` — упоминания `GOOGLE_CLIENT_ID`

Не трогаем `src/components/events/EventModal.tsx`: там ссылки «добавить в Google
Calendar», к авторизации отношения не имеют.

### 2. Вход через Яндекс ID

Конфигурация:

- Backend `Settings`: `yandex_client_id: str | None`, `yandex_client_secret: str | None`
- Frontend build-arg `VITE_YANDEX_CLIENT_ID`
- Redirect URI в кабинете Яндекса: `https://scheduler.runker.ru/auth/yandex/callback`
  и `http://localhost:5173/auth/yandex/callback`
- Права: `login:email`, `login:info` и `login:avatar` — аватарку заполняем, чтобы
  сохранить паритет с прежним поведением Google-входа

SPA-роут callback отдаётся nginx через `try_files $uri $uri/ /index.html`
(`frontend/nginx.conf:27`), отдельная серверная настройка не нужна.

Frontend:

- `src/components/auth/YandexLoginButton.tsx` — генерит `state`
  (`crypto.randomUUID()`), сохраняет его и текущий параметр `redirect` в
  `sessionStorage`, редиректит на `https://oauth.yandex.ru/authorize` с
  `response_type=code`, `client_id`, `redirect_uri`, `state`
- `src/pages/auth/YandexCallbackPage.tsx`, роут `/auth/yandex/callback` —
  сверяет `state` с сохранённым и при расхождении показывает ошибку, не отправляя
  запрос; иначе `POST /api/auth/yandex { code }`, результат в `authStore`,
  редирект на сохранённый `redirect` или `/groups`. Отдельно обрабатывает
  `error` и `error_description` в query — пользователь мог нажать «Отказать»
- `src/api/auth.ts` — метод `yandexAuth`

Backend, `POST /api/auth/yandex`:

1. `yandex_client_id` или `yandex_client_secret` не заданы → 503 `yandex_auth_not_configured`
2. `POST https://oauth.yandex.ru/token` с `grant_type=authorization_code`, `code`,
   `client_id`, `client_secret` (httpx, таймаут 10 секунд). Ошибка или невалидный
   код → 401 `invalid_yandex_code`
3. `GET https://login.yandex.ru/info?format=json` с заголовком
   `Authorization: OAuth <access_token>`. Ошибка → 401 `invalid_yandex_token`
4. Пустой `default_email` → 400 `yandex_email_missing`
5. Поиск `User` по email. Нет — создаём с `emailVerified = now()`,
   `name = real_name or display_name or login`, `image` из
   `https://avatars.yandex.net/get-yapic/{default_avatar_id}/islands-200`
   при `is_avatar_empty == false`
6. Ответ — `AuthResponseSchema`, тот же контракт, что был у google-ручки

Схема запроса: `YandexAuthRequestSchema { code: str, min_length=1 }`.

Сетевые вызовы к Яндексу выносятся в модуль `app/yandex.py`: роутер остаётся
тонким, а тесты мокают одну точку.

### 3. Восстановление и установка пароля

Модель `PasswordResetToken` в `app/models.py`:

| Поле | Тип | Примечание |
| --- | --- | --- |
| `id` | String PK | uuid4 |
| `userId` | FK `User.id` | `ondelete="CASCADE"` |
| `token` | String unique index | `secrets.token_urlsafe(32)` |
| `expiresAt` | DateTime | |
| `usedAt` | DateTime nullable | одноразовость |
| `createdAt` | DateTime | для антиспама |

Миграция: `backend/migrations/versions/202608270001_add_password_reset_token.py`.

`POST /api/auth/forgot-password { email }` всегда отвечает 200
`{ message: "password_reset_email_sent" }`:

- пользователя нет — тихо выходим, наличие аккаунта не раскрываем
- есть неиспользованный токен младше 5 минут — письмо не шлём, ответ тот же
  (защита от засыпания чужой почты и от сжигания квоты Resend)
- иначе удаляем прежние токены пользователя, создаём новый с TTL 1 час, шлём
  письмо. Именно удаляем строки, а не помечаем `usedAt`: `usedAt` означает
  «по ссылке перешли», и путать эти два состояния не нужно

`POST /api/auth/reset-password { token, password }`:

- токена нет, истёк или `usedAt` не пуст → 400 `invalid_or_expired_token`
- `password` валидируется как при регистрации, `min_length=8`
- ставим `passwordHash`, проставляем `emailVerified`, если он был пуст — переход
  по ссылке из письма подтверждает владение почтой, помечаем `usedAt`
- возвращаем `AuthResponseSchema`: пользователь сразу залогинен, как в `verify-email`

Глобальной инвалидации ранее выданных JWT не делаем. Чёрный список в проекте
работает по конкретному токену, поля версии сессии нет, добавлять его ради этой
задачи избыточно.

Frontend:

- `/forgot-password` — форма с email, после отправки нейтральное «если такой
  адрес зарегистрирован, письмо отправлено»
- `/reset-password?token=…` — форма нового пароля с подтверждением,
  переиспользует компонент `PasswordInput`
- Ссылка «Забыли пароль?» на форме входа

### 4. Разовая рассылка

`backend/app/scripts/notify_passwordless_users.py`, запуск в контейнере бэкенда:

```
python -m app.scripts.notify_passwordless_users --dry-run
python -m app.scripts.notify_passwordless_users
```

- выборка `User.passwordHash.is_(None)` — это ровно бывшие Google-юзеры
- на пользователя: удаляем старые токены, создаём новый с TTL 7 дней (длиннее
  самообслуживания — письмо могут прочитать не сразу), шлём миграционное письмо
- `--dry-run` печатает адреса, ничего не пишет в базу и не отправляет
- ошибка отправки одному адресу не роняет прогон: логируем и идём дальше
- пауза 0.6 секунды между письмами — лимит Resend 2 запроса в секунду
- в конце сводка: найдено, отправлено, пропущено, ошибок
- повторный запуск безопасен: у поставивших пароль `passwordHash` уже не NULL,
  они выпадают из выборки

### 5. Письма

`app/email.py` сейчас — одна функция с захардкоженным HTML. Выделяем общий
каркас (шапка, карточка, кнопка, подвал) и `_send(to, subject, html)`, поверх —
три письма:

- `send_verification_email` — как есть
- `send_password_reset_email` — «Сброс пароля», ссылка на 1 час
- `send_password_setup_email` — миграционное: вход через Google отключён,
  кнопка «Установить пароль», ссылка живёт 7 дней, дальше можно входить по почте
  с паролем или через Яндекс ID, а если ссылка протухла — «Забыли пароль» на
  странице входа

Отправитель остаётся `DnD Scheduler <noreply@registering.runker.ru>`.

### 6. Тесты

Исходное состояние: `pytest` даёт 13 failed и 8 errors **до** любых правок.
Причины: тесты бьют в `/auth/...`, тогда как роутеры смонтированы под
`/api/auth/...` (`app/main.py:26`); фикстура `registered_user` ждёт `accessToken`
от регистрации, которая теперь возвращает только `{ message }`; отправка писем не
замокана, тесты ходят в живой Resend.

Чиним как часть работы, иначе новый код нечем покрыть:

- в `conftest.py` автоиспользуемый мок отправки писем, фикстура создаёт
  пользователя с уже подтверждённой почтой напрямую в базе
- пути во всех тестах переводим на `/api/auth/...`

Новое покрытие:

- Яндекс: новый пользователь, существующий пользователь, пустой `default_email`,
  невалидный код, ненастроенный клиент
- forgot-password: существующий и несуществующий email дают одинаковый ответ;
  токен создаётся только в первом случае; повторный вызов в течение 5 минут не
  создаёт второй токен
- reset-password: успех (пароль работает, `usedAt` проставлен, `emailVerified`
  выставлен), истёкший токен, повторно использованный, несуществующий
- скрипт рассылки: выбирает только беспарольных, `--dry-run` ничего не пишет,
  ошибка отправки не прерывает прогон

## Порядок выката

1. Прогнать миграцию БД, выкатить релиз: Google отключён, Яндекс включён,
   восстановление пароля доступно
2. Запустить скрипт с `--dry-run`, сверить список адресов
3. Запустить рассылку боевым прогоном
4. Через неделю можно повторить прогон — заденет только тех, кто пароль так и не
   поставил

Шаги 1–3 идут подряд, в одно окно: с момента выката и до рассылки бывшие
Google-юзеры войти не могут.

## Что осознанно не делаем

- Таблицу привязок OAuth-аккаунтов и кнопку «привязать Яндекс ID» в профиле.
  Бывшие Google-юзеры с `@gmail.com` живут на пароле; если понадобится — это
  отдельная задача
- Глобальную инвалидацию сессий при сбросе пароля
- Постоянную админскую ручку для массовых рассылок
