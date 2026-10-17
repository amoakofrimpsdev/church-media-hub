# RCW Media

A web app for a church media team. After every service the team uploads photos
and videos here, the app files them in the church's Google Drive, and the teams
that need them (thumbnails, social media, the website) are told when their
content is ready.

Live at **https://church-media-hub-khaki.vercel.app** (invite only).

## What it replaces

The team used to make four Google Photos albums by hand for every service and
coordinate in a Telegram group. That left the same problems each week:

| Problem | What the app does |
|---|---|
| Creating four albums every service is tedious | Creating a service makes its Drive folder and one subfolder per category. Weekly services are created automatically. |
| People forget to upload | The Telegram bot tags only the people who still owe something, 3 and 20 hours after the service. |
| Nobody knows who uploaded what, or when | Every upload is recorded with the person, time, service and category. |
| Nobody knows who is responsible for what | Admins assign people to roles and categories per service. The home page shows what is still missing. |
| Downstream teams do not get content on time | Each category has receiving teams with a deadline. Handoffs show as pending, ready, delivered or late, and late ones are flagged in Telegram. |

## Features

- **Sign-in:** Google sign-in, invite only. Three roles: admins manage everything,
  members upload and complete tasks, viewers (receiving teams) see only the
  categories delivered to their team.
- **Regions:** each region (Metro Heights, OC, West Valley…) has its own
  services, people, region admins, Drive folder (or its own Google account) and
  Telegram group. Members see only their region.
- **Services:** one-off or weekly recurring, each with Drive folders created for it.
- **Uploads:** many files at once from a phone, sent straight to Google Drive in
  resumable chunks, with per-file progress and retry. Files are owned by the
  church's Google account.
- **Gallery:** an album per service and category, full-size viewer, download, and
  search by category, service and date range.
- **Share links:** a link for someone without an account (a pastor, a church
  leader) to view and download one album, one category across every service,
  one service, or the whole gallery. Links can expire and can be turned off.
- **Assignments and handoffs:** who covers what, what is still missing, and what
  each receiving team is waiting for.
- **Telegram bot:** posts each service's upload link on the morning of the service, sends upload reminders, tells teams
  when their content is ready and flags late handoffs.

## How it is built

| Piece | Used for | Plan |
|---|---|---|
| [Next.js 16](https://nextjs.org) (App Router), TypeScript, Tailwind CSS 4 | The app | |
| [Supabase](https://supabase.com) | Postgres database, Google sign-in, scheduled jobs | Free |
| [Vercel](https://vercel.com) | Hosting | Hobby (free) |
| Google Drive API | File storage, in the church's Google account | Existing 1 TB plan |
| Telegram Bot API | Group messages | Free |

The whole thing runs at $0 a month.

Permissions are enforced in the database with Row Level Security, so they hold
even if a page has a bug. File bytes never pass through the server: the browser
uploads directly to Google using a one-file session the server starts.

The reasoning behind each technical choice is written up in
[docs/DECISIONS.md](docs/DECISIONS.md). It is the best place to start if you
want to understand why the code is the way it is.

## Project layout

```
app/
  (app)/            Pages for signed-in people: home, services, gallery, handoffs, admin
  s/                Public share-link pages, for people without an account
  preview/          Design previews with sample data (local development only)
  api/              Upload, thumbnail, file, Google, Telegram and scheduled-job endpoints
  auth/, login/     Sign-in flow
components/         UI building blocks, the uploader, the gallery
lib/
  domain/           Business rules as pure functions (deadlines, permissions, reminders…)
  google/           Drive and OAuth calls, token encryption
  telegram/         Bot API calls and message wording
  notifications/    What gets posted to Telegram, and when
  jobs/             Scheduled work: recurring services, cleanup
  supabase/         Database clients and types
supabase/
  migrations/       The database schema, in order
  seed.sql          Sample data for a local database
tests/
  unit/             Rules, message wording, the upload queue
  db/               Row Level Security and triggers, against a real Postgres
  e2e/              Browser tests, including the main flow
docs/               Spec, design system, decisions, scheduler setup
proxy.ts            Session refresh and signed-out redirects (Next.js 16's middleware)
```

## Running it locally

You need Node.js 24 and accounts for the services below. Everything used is on
a free plan.

1. **Install:**

   ```bash
   npm install
   ```

2. **Configure:** copy `.env.example` to `.env.local` and fill it in. Each
   variable is explained in that file, including where to find its value.

3. **Create the database tables** in your Supabase project:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

4. **Invite yourself as the first admin.** In the Supabase SQL editor:

   ```sql
   insert into public.invites (email, role) values ('you@example.com', 'admin');
   ```

5. **Start the app** and open http://localhost:3000:

   ```bash
   npm run dev
   ```

6. **Connect Google Drive** under Admin → Google Drive, signing in with the
   account that should own the files.

The Telegram bot and the scheduler only work on a public address, so set those
up on the deployed site (Admin → Telegram, and
[docs/SCHEDULER.md](docs/SCHEDULER.md)).

### One-time setup outside the code

- **Supabase:** enable the Google provider under Authentication, and add your
  local and deployed addresses to the redirect URLs.
- **Google Cloud:** create an OAuth client, enable the Drive API, add
  `<supabase-url>/auth/v1/callback` and `<app-url>/api/google/callback` as
  redirect URIs, and publish the consent screen (apps left in "Testing" lose
  their Drive connection every 7 days).
- **Telegram:** create a bot with @BotFather and add it to the team's group.

## Testing

```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript, strict mode
npm test             # Unit and database tests (Vitest)
npm run test:e2e     # Browser tests (Playwright)
```

- **Unit tests** cover the business rules: permissions, deadlines and late
  logic, who gets reminded, time zones, upload chunking and resume.
- **Database tests** apply every migration to an in-process Postgres
  ([PGlite](https://pglite.dev)) and query it as an admin, a member, viewers on
  different teams and a signed-out visitor. No Docker needed.
- **Browser tests** check that signed-out visitors are kept out and that the
  webhook and scheduled-job endpoints reject calls without their secret.
- **The main-flow test** creates a service, uploads a photo and finds it in the
  gallery. It needs a local Supabase (which needs Docker), so it runs in CI and
  is skipped otherwise. To run it yourself: `npx supabase start`, then set
  `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` and `E2E_SUPABASE_SERVICE_KEY`
  from `npx supabase status` and run `npm run test:e2e`. Google Drive is
  replaced by a small fake server, so nothing real is touched.

GitHub Actions runs all of the above on every push.

## Deployment

The repository is connected to Vercel. Merging to `main` deploys the live site;
every other branch gets its own preview address.

Before merging a change that adds a migration, apply it:

```bash
npx supabase db push
```

Environment variables are set in Vercel under Settings → Environment Variables
(the same names as `.env.example`). After changing one, redeploy for it to take
effect.

Scheduled jobs run from two places, both free: Supabase calls the app every 15
minutes, and Vercel calls it once a day as a backup. Setup is in
[docs/SCHEDULER.md](docs/SCHEDULER.md). Admin → Schedule shows when the jobs
last ran.

## Documentation

- [docs/SPEC.md](docs/SPEC.md): the original brief.
- [docs/DECISIONS.md](docs/DECISIONS.md): every major technical choice and why.
- [docs/DESIGN.md](docs/DESIGN.md): the design system (colours, type, components).
- [docs/SCHEDULER.md](docs/SCHEDULER.md): turning on the scheduled jobs.

## Not built yet

Left out of this version on purpose; the schema leaves room for them.

- A social media posting calendar.
- AI caption drafts and photo tagging.
- Importing the old Google Photos albums (uploads already have a `source`
  column reserved for it).
