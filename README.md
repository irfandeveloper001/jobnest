# JobNest Monorepo

JobNest monorepo with:
- `apps/web`: Remix frontend (JavaScript only)
- `apps/api`: Laravel API backend (Sanctum token auth)
- `docker/docker-compose.yml`: local infrastructure (`mysql`, `redis`, `mailhog`)

## Architecture Rule (Strict)
All Laravel API calls are made **only from Remix loaders/actions** (server-side). The browser does not call Laravel directly.

## Repository Layout

```text
jobnest/
  apps/
    web/
    api/
  docker/
    docker-compose.yml
  README.md
  .gitignore
```

## 1) Start Infrastructure

```bash
cd docker
docker compose up -d
```

Services:
- MySQL: `127.0.0.1:3307`
- Redis: `127.0.0.1:6380`
- MailHog SMTP: `127.0.0.1:1025`
- MailHog UI: `http://127.0.0.1:8025`

## 2) Laravel API Setup (`apps/api`)

```bash
cd apps/api
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
```

Run API server:

```bash
php artisan serve --host=127.0.0.1 --port=8000
```

Run queue worker (Redis required):

```bash
php artisan queue:work redis --tries=3 --timeout=120
```

Optional inbox monitor command:

```bash
php artisan inbox:sync
```

Seed global location dataset (countries/states/cities) from:
`https://github.com/dr5hn/countries-states-cities-database`

```bash
php artisan db:seed --class=LocationsSeeder
```

Notes:
- This downloads `countries.json`, `states.json`, and `cities.json` into `storage/app/location-seeds/`.
- First run can take time because the cities dataset is large.

### Laravel Environment (`apps/api/.env`)

Required values:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3307
DB_DATABASE=jobnest
DB_USERNAME=jobnest
DB_PASSWORD=jobnest

CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6380

MAIL_MAILER=smtp
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
MAIL_FROM_ADDRESS="no-reply@jobnest.local"
MAIL_FROM_NAME="JobNest"
```

## 3) Remix Web Setup (`apps/web`)

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Default Remix URL: `http://127.0.0.1:3000`

Tailwind is preconfigured through the Remix/PostCSS pipeline:
- `apps/web/tailwind.config.js`
- `apps/web/postcss.config.js`
- `apps/web/app/tailwind.css`
- `apps/web/app/styles/global.css`

The UI uses:
- Inter font
- Material Symbols Outlined
- Emerald primary theme (`#16A34A`)
- Shared layouts:
  - `apps/web/app/components/PublicLayout.jsx`
  - `apps/web/app/components/AppLayout.jsx`

### Remix Environment (`apps/web/.env`)

```env
SERVICE_API_BASE_URL=http://localhost:8000
SESSION_SECRET=replace-with-random-secret
PORT=3000
```

## 4) User Profile + Auto Job Sync Flow

After sign-in/sign-up (user role):
- If profile is incomplete, user is redirected to `http://127.0.0.1:3000/app/profile`.
- Complete profile fields and upload CV on `/app/profile`.
- Preferred location is now structured as `Country -> State -> City`.
- CV upload and completed profile trigger `AutoJobSyncJob` on Redis queue.
- Jobs are then available by default on `/app/jobs` without manual import/search.

Required background worker:

```bash
cd apps/api
php artisan queue:work redis --tries=3 --timeout=120
```

Optional manual sync from Jobs page:
- Click `Sync Now` on `/app/jobs` to queue another profile-based sync run.

## Implemented Backend Features

- Sanctum token auth:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- User/job/application APIs:
  - `GET /api/jobs`
  - `GET /api/jobs/{id}`
  - `PATCH /api/jobs/{id}/status`
  - `POST /api/applications` (multipart CV upload)
  - `GET /api/inbox/threads`
  - `GET /api/metrics`
- Admin APIs:
  - `GET /api/admin/users`
  - `GET /api/admin/sync-logs`
  - `GET /api/admin/email-logs`
  - `GET /api/admin/job-sources`
  - `PATCH /api/admin/job-sources/{id}`

## Redis Usage (Required)

- Queue: `QUEUE_CONNECTION=redis`
- Cache: `CACHE_DRIVER=redis`
- Session: `SESSION_DRIVER=redis`
- Jobs list cache: 60s (`jobs:{hash}`)
- Metrics cache: 30s

## CV Upload + Email Flow

1. User submits application to `POST /api/applications`.
2. CV is validated (`pdf/doc/docx`, max 5MB) and stored in `storage/app/cvs/{userId}/...`.
3. `SendApplicationEmailJob` is dispatched to Redis queue.
4. Queued job sends email with CV attachment.
5. Delivery state is tracked in `email_logs` and `applications.status`.

## Notes

- `composer.json` targets Laravel 11 APIs.
- If optional IMAP package `webklex/laravel-imap` is installed, `inbox:sync` can be extended for real mailbox ingestion.

## Frontend Route File List

Public:
- `apps/web/app/routes/_index.jsx`
- `apps/web/app/routes/features.jsx`
- `apps/web/app/routes/pricing.jsx`
- `apps/web/app/routes/faq.jsx`
- `apps/web/app/routes/contact.jsx`

Auth:
- `apps/web/app/routes/auth.sign-in.jsx`
- `apps/web/app/routes/auth.sign-up.jsx`
- `apps/web/app/routes/auth.forgot-password.jsx`
- `apps/web/app/routes/auth.reset-password.jsx`

User app:
- `apps/web/app/routes/app.dashboard.jsx`
- `apps/web/app/routes/app.jobs.jsx`
- `apps/web/app/routes/app.jobs.$id.jsx`
- `apps/web/app/routes/app.applications.jsx`
- `apps/web/app/routes/app.interviews.jsx`
- `apps/web/app/routes/app.analytics.jsx`
- `apps/web/app/routes/app.inbox.jsx`
- `apps/web/app/routes/app.profile.jsx`

Admin:
- `apps/web/app/routes/admin.dashboard.jsx`
- `apps/web/app/routes/admin.users.jsx`
- `apps/web/app/routes/admin.job-sources.jsx`
- `apps/web/app/routes/admin.email-logs.jsx`
