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

RAPIDAPI_KEY=
RAPIDAPI_HOST=jsearch.p.rapidapi.com
RAPIDAPI_BASE_URL=https://jsearch.p.rapidapi.com
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
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
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_APP_ID=
```

## 4) Firebase Cloud Auth + CV Storage

JobNest uses Firebase Cloud for:
- Email/password authentication (Remix auth pages).
- CV file upload (Firebase Storage).

Laravel still owns protected APIs, queues, sync logic, inbox, and analytics.

### Firebase setup

1. Create a Firebase project at `https://console.firebase.google.com`.
2. Enable **Authentication -> Email/Password**.
3. Enable **Storage** and create the default bucket.
4. Generate a Service Account JSON:
   - Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.
5. Set web client envs in `apps/web/.env`.
6. Set backend envs in `apps/api/.env`:
   - `FIREBASE_PROJECT_ID=<your-project-id>`
   - `FIREBASE_SERVICE_ACCOUNT_JSON=/absolute/path/to/service-account.json`
     (or inline JSON string)

### Firebase dependency install

```bash
cd apps/web
npm install firebase

cd ../api
composer require kreait/firebase-php
php artisan migrate
```

### Auth flow

1. User signs in/up with Firebase in Remix.
2. Remix gets Firebase ID token.
3. Remix action `/auth/session` sends token to Laravel `POST /api/auth/firebase-login`.
4. Laravel verifies token, upserts user (`firebase_uid`), issues Sanctum token.
5. Remix stores Sanctum token in `httpOnly` cookie session.

Browser never calls Laravel directly.

### CV flow

1. User selects CV on `/app/profile`.
2. Browser uploads file to Firebase Storage path:
   `cvs/{firebase_uid}/{timestamp}_{filename}`.
3. Remix posts metadata to Laravel `POST /api/profile/cv-meta`.
4. Laravel stores metadata in MySQL and dispatches profile-based auto sync.

## 5) User Profile + Auto Job Sync Flow

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

## 6) RapidAPI JSearch Integration

Job import now supports RapidAPI JSearch through Laravel only (never from browser/client code).

1. Create/get your API key from RapidAPI dashboard for JSearch.
2. Set in `apps/api/.env`:

```env
RAPIDAPI_KEY=your-real-key
RAPIDAPI_HOST=jsearch.p.rapidapi.com
RAPIDAPI_BASE_URL=https://jsearch.p.rapidapi.com
```

3. Restart Laravel API and queue worker:

```bash
cd apps/api
php artisan serve --host=127.0.0.1 --port=8000
php artisan queue:work redis --tries=3 --timeout=120
```

4. In `/app/jobs`, open **New Job Assistant**, choose source `JSearch (RapidAPI)`, then click **Find Jobs**.

Backend endpoint:
- `POST /api/jobs/import`
  - accepts `keyword`, `source=arbeitnow|remotive|jsearch|all`, `only_new`, `country`, `remote`
  - if JSearch is rate-limited/quota-exceeded, backend automatically falls back to free sources (`arbeitnow`, `remotive`)
  - returns warning payload (example): `JSearch quota exceeded. Using free sources.`

### Local Demo Stability

To ensure `/app/jobs` always has data locally, run:

```bash
cd apps/api
php artisan db:seed --class=JobSourceSeeder
php artisan db:seed --class=JobDemoSeeder
```

`JobDemoSeeder` inserts 30 realistic Pakistan-focused jobs (Lahore, Karachi, Islamabad, Remote Pakistan).

## Implemented Backend Features

- Sanctum token auth:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/firebase-login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- User/job/application APIs:
  - `GET /api/jobs`
  - `GET /api/jobs/{id}`
  - `PATCH /api/jobs/{id}/status`
  - `POST /api/profile/cv-meta` (Firebase Storage metadata)
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

## References

These references were used to study product patterns, workflow ideas, and implementation approaches during planning.  
**Used for inspiration; JobNest codebase is original.**

### Laravel Tracker Inspiration
- [Job-Application-Tracker](https://github.com/bskscmn/Job-Application-Tracker)  
  Application tracking flow and status-oriented dashboard concepts.
- [laravel-jobsave](https://github.com/halayuba/laravel-jobsave)  
  Laravel-focused job saving and management patterns.

### Email Editor Inspiration
- [Mosaico](https://mosaico.io/)  
  Visual template editing ideas for outreach/email composition UX.
- [email-builder-js](https://github.com/usewaypoint/email-builder-js)  
  Component-based email editor and preview interaction concepts.
- [Maily](https://maily.to/)  
  Modern editor ergonomics and template workflow inspiration.

### Job Import Inspiration
- [Arbeitnow Job Board API](https://www.arbeitnow.com/blog/job-board-api)  
  Free-source job ingestion and normalization reference.
- [Apify Remote Jobs Aggregator](https://apify.com/benthepythondev/remote-jobs-aggregator)  
  Aggregation strategy inspiration for multi-source import/sync pipelines.

## DB Schema Mapping (JobNest ↔ References)

| JobNest Module | JobNest Tables | Reference Project / Concept | Notes (conceptually borrowed) |
|---|---|---|---|
| Jobs / Leads | `job_sources`, `jobs`, `sync_logs` | Arbeitnow API, Apify remote-jobs-aggregator | Source-based import, normalization, deduping, and sync logging model. |
| Applications | `applications`, `job_recipients`, `email_logs` | Job-Application-Tracker, laravel-jobsave | End-to-end application lifecycle tracking with communication/delivery states. |
| Inbox Monitor | `inbox_threads`, `inbox_messages` | Communication tracking concept (custom in JobNest) | Thread/message timeline and follow-up workflow are custom-built for JobNest needs. |
| Outreach Templates | *(planned table: `email_templates`)* | Mosaico, email-builder-js, Maily | Template editing/preview UX concepts; persistence schema remains project-defined. |
| Users / Auth | `users` | General auth and user-management patterns | JobNest uses Firebase + Laravel Sanctum bridge and stores app-specific profile/auth metadata. |
