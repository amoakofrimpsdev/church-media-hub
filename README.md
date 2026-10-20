<p align="center">
  <img src="public/brand/logo.jpg" alt="RCW LA Media" width="160" />
</p>

<h1 align="center">RCW Media</h1>

<p align="center">
  Where the RCW LA media team uploads, finds and hands off photos and videos
  from every service, across every region.<br />
  <a href="https://church-media-hub-khaki.vercel.app"><strong>church-media-hub-khaki.vercel.app</strong></a>
  (invite only)
</p>

---

After a service, the team uploads straight from their phones. The app files
everything in Google Drive, sorted by service and category. It tells the teams
that need the content (thumbnails, social media, the website) when it is ready,
and reminds whoever has not uploaded. Church leaders without an account can be
sent a link to view and download what they need.

It runs on free plans: **$0 a month**.

## Contents

- [What it replaces](#what-it-replaces)
- [Features](#features)
- [Who can do what](#who-can-do-what)
- [What the Telegram bot posts](#what-the-telegram-bot-posts)
- [How it is built](#how-it-is-built)
- [Project layout](#project-layout)
- [Running it locally](#running-it-locally)
- [Testing](#testing)
- [Deploying](#deploying)
- [Documentation](#documentation)

## What it replaces

The team used to make four Google Photos albums by hand for every service and
coordinate in a Telegram group.

| Problem | What the app does |
|---|---|
| Making albums for every service is tedious | Creating a service makes its Drive folder and one subfolder per category. Weekly services, and ones that alternate weeks, are created automatically. |
| People forget to upload | The bot posts each service's upload link on the morning of the service, then tags only the people who still owe something, 3 and 20 hours after it starts. |
| Nobody knows who uploaded what, or when | Every upload is recorded with the person, time, service and category, and the group sees a running "✅ Daniel uploaded 24 photos to Baptism" list. |
| Nobody knows who is responsible for what | Admins assign people to roles and categories per service. The home page shows what is still missing. |
| Receiving teams do not get content on time | Each category has receiving teams with a deadline. Handoffs show as pending, ready, delivered or late, and late ones are flagged in Telegram. |
| Leaders ask for specific photos | Share links let someone without an account view and download one album, a category, a service or the whole gallery. |

## Features

**Regions.** Metro Heights, OC, West Valley and any added later each have their
own services, people, schedule, Drive folder and Telegram group. Members only
see their own region(s). A region can keep its files in the church Drive (the
default) or connect its own Google account.

**Uploading.** Pick everything at once from a phone, straight into Google Drive
in resumable chunks: a dropped connection costs seconds, not the whole file.
Files are owned by the church's (or the region's) Google account. Photos,
videos, HEIC and camera raw files up to 20 GB each.

**Gallery.** An album per service and category, a full-size viewer with swipe,
and search by category, service and date. **Select to download** saves many
photos at once as a single ZIP, built in the browser.

**Services and schedule.** One-off services, or repeating ones every week,
every other week, or every 3 or 4 weeks (for example a women's and a men's
midweek service on alternate Wednesdays).

**Assignments and handoffs.** Who covers what at each service, what is still
missing, and what each receiving team is waiting for. A category is ready when
everyone assigned to it taps **Done**.

**Share links.** For a pastor or leader with no account: one album, one
category across every service, one service, or the whole gallery (or a whole
region). Links can expire, can be view-only, and can be turned off. Admins see
how many people opened each link, how many visits and how many downloads.

**People.** Invite one person or paste a list of emails, with the same role,
team and regions for all. Sign-in is with Google, invite only.

**Home page.** The service people are most likely there for, with the upload
button one tap away; your tasks; handoffs; fresh uploads; and charts of uploads
per week, by category, by person, and on-time deliveries.

**Look.** Light, in the blue of the RCW LA Media logo, with an optional
deep-navy dark mode (Light, Dark or Auto, remembered per device). Built phone
first, and it can be added to the home screen like an app.

## Who can do what

| | Super admin | Region admin | Member | Viewer |
|---|---|---|---|---|
| Set on the People page as | Role **Admin** | Role **Member** + **Region admin** ticked | Role **Member** | Role **Viewer** + a team |
| Sees | Every region | Their region(s) | Their region(s) | Only categories delivered to their team, in their region(s) |
| Uploads and marks tasks done | ✓ | ✓ | ✓ | |
| Services, schedule, assignments | Every region | Their region | | |
| Invites people | Anyone, any region | Members and viewers, to their region | | |
| Share links | Anything | Their region | | |
| Region's Drive and Telegram group | Every region | Their region | | |
| Regions, teams, categories, church Drive, main Telegram group | ✓ | | | |
| Marks a handoff received | ✓ | | | ✓ (their team's) |

All of this is enforced in the database with Row Level Security, so it holds
even if a page has a bug.

## What the Telegram bot posts

The bot posts in the region's own group if it has one, otherwise in the
church's main group (with the region's name on each post). It tags only the
people a message is about.

| Message | When |
|---|---|
| 📸 **Today: Sunday Service**, with the upload link and who is covering | 7:00 AM on the day (2 hours before an earlier service) |
| 📤 **Uploads for Sunday Service**: ✅ who uploaded what | When someone's batch of uploads finishes; the same message updates as more come in |
| ⏰ **Still to upload** | 3 and 20 hours after the service starts, tagging only people with nothing uploaded |
| ✅ **Baptism is ready for Social Media** | When a category is ready for a receiving team |
| **Late** | When a handoff passes its deadline without being marked received |

People connect their Telegram by sending `/join` to the bot in a private chat.
A group is linked by sending `/linkgroup` in it.

## How it is built

| Piece | Used for | Plan |
|---|---|---|
| [Next.js 16](https://nextjs.org) (App Router), TypeScript, Tailwind CSS 4 | The app | |
| [Supabase](https://supabase.com) | Postgres, Google sign-in, Row Level Security, scheduled jobs (pg_cron) | Free |
| [Vercel](https://vercel.com) | Hosting, plus a daily backup cron | Hobby (free) |
| Google Drive API | File storage in the church's (or a region's) own Google account | Free; uses the account's existing storage |
| Telegram Bot API | Group messages | Free |

A few choices that keep it free and safe:

- **File bytes never pass through the server on upload.** The browser sends each
  file straight to Google using a one-file upload session the server starts,
  and the server then checks with Google that the file really arrived.
- **Only the `drive.file` permission**, so the app can see only the files it
  created, and Google's paid app review is not needed.
- **Refresh tokens are encrypted** (AES-256-GCM) before they are stored.
- **Large videos open in Google Drive** rather than streaming through the app,
  to stay within the free hosting allowance.
- **Messages are sent once.** Every Telegram post has a key in
  `notification_log`, so jobs can run as often as they like.

Every major decision, and why, is in [docs/DECISIONS.md](docs/DECISIONS.md).

## Project layout

```
app/
  (app)/            Signed-in pages: home, services, gallery, handoffs, admin
  s/                Public share-link pages
  preview/          Design previews with sample data (local development only)
  api/              Upload, thumbnail, file, share, Google, Telegram and job endpoints
  auth/, login/     Sign-in
components/         Screens ("views") and UI building blocks
lib/
  domain/           Business rules as pure functions: permissions, deadlines,
                    reminders, recurrence, share links, regions…
  google/           Drive and OAuth calls, one session per Google account
  telegram/         Bot API calls and message wording
  notifications/    What gets posted to Telegram, when, and to which group
  jobs/             Scheduled work: recurring services, retries, clean-up
  supabase/         Database clients and types
  zip.ts            Builds the "Select to download" ZIP in the browser
supabase/
  migrations/       The database schema, in order
  seed.sql          Sample data for a local database
tests/
  unit/             Rules, message wording, the upload queue, ZIP files
  db/               Row Level Security and triggers, on a real Postgres
  e2e/              Browser tests, including the main flow
  tools/            Screenshot tool for the design previews
docs/               Spec, design system, decisions, scheduler setup
proxy.ts            Session refresh and signed-out redirects (Next.js 16's middleware)
```

## Running it locally

You need Node.js 24 and free accounts for Supabase, Google Cloud and Telegram.

1. **Install**

   ```bash
   npm install
   ```

2. **Configure.** Copy `.env.example` to `.env.local` and fill it in. Each
   variable is explained in that file:

   | Variable | What it is |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | Where the app runs, e.g. `http://localhost:3000` |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase project |
   | `SUPABASE_SECRET_KEY` | Server-only Supabase key |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client for Drive |
   | `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64, for encrypting Google tokens |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | From @BotFather |
   | `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET` | Random strings you choose |

3. **Create the database tables**

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

4. **Invite yourself as the first admin**, in the Supabase SQL editor:

   ```sql
   insert into public.invites (email, role) values ('you@example.com', 'admin');
   ```

5. **Start the app** and open http://localhost:3000:

   ```bash
   npm run dev
   ```

6. **Connect Google Drive** under Admin → Google Drive, signing in with the
   account that should own the files.

The Telegram bot and the scheduler need a public address, so set those up on
the deployed site (Admin → Telegram, and [docs/SCHEDULER.md](docs/SCHEDULER.md)).

### One-time setup outside the code

- **Supabase:** enable the Google provider under Authentication, and add your
  local and deployed addresses to the redirect URLs.
- **Google Cloud:** create an OAuth client, enable the Drive API, add
  `<supabase-url>/auth/v1/callback` and `<app-url>/api/google/callback` as
  redirect URIs, and publish the consent screen (apps left in "Testing" lose
  their Drive connection every 7 days).
- **Telegram:** create a bot with @BotFather and add it to the team's group.

### Design previews

`/preview/<screen>` shows any screen with sample data, without signing in or a
database: `dashboard`, `services`, `service`, `album`, `gallery`, `upload`,
`regions`, `people`, `invite-form`, `teams`, `categories`, `schedule`,
`shares`, `share`, `login` and more. They exist only under `npm run dev`.

```bash
node tests/tools/screenshot.mjs http://localhost:3000 ./shots dashboard regions
node tests/tools/screenshot.mjs http://localhost:3000 ./shots dashboard --dark
```

## Testing

```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript, strict mode
npm test             # Unit and database tests (Vitest)
npm run test:e2e     # Browser tests (Playwright)
npm run test:perf    # Load test: two years of data, the busiest queries timed
node tests/tools/probe-live.mjs https://church-media-hub-khaki.vercel.app
                     # Read-only checks of the live site, as a stranger
```

- **Unit tests** cover the business rules: permissions, deadlines, reminders,
  recurrence and daylight saving, upload chunking and resume, message wording,
  share links, email lists and ZIP files.
- **Leak guards** (`tests/db/security.test.ts`) check every table and function
  that exists, so anything added later without protection fails: Row Level
  Security on everywhere, nothing for signed-out visitors, server-only tables
  and private columns closed, and people's details hidden across regions.
- **Database tests** apply every migration to an in-process Postgres
  ([PGlite](https://pglite.dev)) and query it as a super admin, a region admin,
  members and viewers in different regions, and a signed-out visitor. No
  Docker needed.
- **Browser tests** check that signed-out visitors are kept out and that the
  webhook and job endpoints reject calls without their secret.
- **The main-flow test** signs in, creates a service, uploads a photo, finds
  it in the gallery, shares it and deletes it. It needs a local Supabase
  (Docker), so it runs in CI. Google Drive is replaced by a small fake server.

GitHub Actions runs all of it on every push.

## Deploying

The repository is connected to Vercel: merging to `main` deploys the live
site, and every other branch gets its own preview address.

**Before merging a change that adds a file under `supabase/migrations/`**,
apply it to the live database:

```bash
npx supabase db push
```

Environment variables live in Vercel under Settings → Environment Variables
(the same names as `.env.example`); redeploy after changing one.

Scheduled jobs run from two places, both free: Supabase calls the app every 15
minutes, and Vercel calls it once a day as a backup. Admin → Schedule shows
when they last ran. Setup is in [docs/SCHEDULER.md](docs/SCHEDULER.md).

## Documentation

- [docs/DECISIONS.md](docs/DECISIONS.md): every major technical choice, and why.
- [docs/DESIGN.md](docs/DESIGN.md): the design system (colours, type, components).
- [docs/SCHEDULER.md](docs/SCHEDULER.md): turning on the scheduled jobs.
- [docs/SPEC.md](docs/SPEC.md): the original brief.

## Not built yet

Left out on purpose; the schema leaves room for them.

- A social media posting calendar.
- AI caption drafts and photo tagging.
- Importing the old Google Photos albums (uploads already have a `source`
  column reserved for it).
