# Decisions

A running log of the main technical choices in this project and why they were
made. Newest phase at the bottom.

## Phase 0: Foundation

### Design system adapted from Airbnb's

**Choice:** Base the UI on the Airbnb `DESIGN.md` from awesome-design-md, with our
own font (Geist) and accent colour (indigo). Details are in [DESIGN.md](DESIGN.md).

**Why:** The app is mostly photo albums viewed on phones. Airbnb's system is built
for exactly that: a white canvas, quiet type, rounded photo cards and 48px touch
targets. Swapping the font and accent keeps the structure while avoiding a
licensed font and another company's brand colour.

### Design tokens in Tailwind's `@theme`, not a component library

**Choice:** Colours, radii, type sizes and breakpoints are CSS variables in
`app/globals.css`. Tailwind 4 turns each into a utility class. UI primitives are
small hand-written components in `components/ui`.

**Why:** No extra dependencies, nothing to pay for, and one file to change if the
look needs adjusting. A library like shadcn/ui would work too, but it brings its
own token names and far more components than v1 needs.

### Light mode only for v1

**Choice:** Removed the starter's dark-mode colours.

**Why:** A half-finished dark mode looks worse than none. Tokens are named by
role (`canvas`, `ink`), so dark values can be added later in one place.

### Business rules as pure functions in `lib/domain`

**Choice:** Rules like "is this handoff late?" live in plain TypeScript functions
that take their inputs (including the current time) as arguments. They never read
the database or the clock themselves.

**Why:** The dashboard, the reminder job and the Telegram bot must all agree on
the answer. A pure function can be unit tested without a database, and passing
`now` in makes time-based tests exact instead of flaky.

**Rule recorded here:** a handoff is `pending` until its deadline, `late` after
it, and `delivered` once the receiving team marks it received, even if that was
after the deadline. Late deliveries are still identifiable (`wasDeliveredLate`).

### Vitest for unit tests, Playwright for end-to-end

**Choice:** Vitest with jsdom and React Testing Library for logic and simple
components. Playwright, emulating a Pixel 7, for flows through the real app.

**Why:** This is the setup the Next.js 16 docs recommend. Vitest cannot render
async Server Components, so anything involving pages and data is tested through
Playwright instead. The phone profile matches how the app will actually be used.

### CI on GitHub Actions, two jobs

**Choice:** One job runs lint, typecheck and unit tests. A second builds the app
and runs Playwright against the production build.

**Why:** The fast job fails within a minute or two on simple mistakes. The slower
job proves the app really builds and loads. GitHub Actions is free for public
repositories.

### `@types/node` moved from 20 to 24

**Choice:** Bumped the Node type definitions.

**Why:** Vitest 5 requires Node types 22 or newer, and the project runs on Node 24
locally and in CI.

### Work on a branch per phase

**Choice:** Each phase is built on its own branch and merged to `main` when it is
finished and checked.

**Why:** Vercel deploys `main` to the live site and every other branch to its own
preview URL. A phase can be verified on a real Vercel build without changing what
the team sees until it is ready.

## Phase 1: Sign-in and roles

### The invite gate is a database trigger

**Choice:** A trigger on Supabase's `auth.users` table runs when a new account
is being created. If the email has no row in `invites`, it raises an error and
the whole sign-up is rolled back. If there is an invite, the same trigger creates
the person's profile with the invited role and team.

**Why:** Checking invites in app code would leave a gap: anyone could call
Supabase's sign-up API directly and get an account. Putting the rule in the
database means there is exactly one door, and it is locked for every route in.
Supabase also offers a "Before User Created" hook that can do this, but it is
configured by hand in the dashboard, while a trigger lives in a migration and is
version controlled.

### Permissions are enforced by Row Level Security, mirrored in TypeScript

**Choice:** Every table has RLS policies that use two small helper functions,
`private.current_app_role()` and `private.is_admin()`. The app talks to the
database as the signed-in user with the publishable key, so those policies apply
to every query. `lib/domain/permissions.ts` repeats the same rules in TypeScript.

**Why:** RLS is the real protection: even a bug in a page or a hand-crafted
request cannot read or change rows the policies forbid. The TypeScript copy only
exists to hide buttons people cannot use and to give friendly error messages.
The helper functions sit in a `private` schema that Supabase does not expose
through its API, and they are `security definer` so the `profiles` policy can
look up a role without recursing into itself.

### People are deactivated, not deleted

**Choice:** Removing someone sets `profiles.active` to false. A deactivated
person has no role, so every policy treats them as a stranger.

**Why:** Uploads will record who uploaded them. Deleting the person would either
delete that history or leave it pointing at nobody.

### There is always at least one admin

**Choice:** A trigger refuses any change that would demote or deactivate the last
active admin, and the app does not let admins change their own access.

**Why:** With no admin, nobody could invite people or fix roles, and the only
way back in would be editing the database by hand.

### Emails are stored lowercase

**Choice:** `profiles.email` and `invites.email` have a check constraint
requiring lowercase, and the app normalizes before saving.

**Why:** Google treats `Grace@gmail.com` and `grace@gmail.com` as the same
account. Storing one canonical form avoids an invite silently failing to match.
Postgres has a case-insensitive text type (`citext`), but its operators live in
a separate schema, which is awkward inside the locked-down trigger functions.

### Session refresh in `proxy.ts`

**Choice:** `proxy.ts` (Next.js 16's new name for middleware) refreshes the
Supabase session cookie on each navigation and redirects signed-out visitors to
`/login`. Pages still call `requireProfile()` or `requireAdmin()` themselves.

**Why:** Server Components cannot write cookies, so something that runs before
them has to refresh an expiring session. The redirect there is for convenience
only. The Next.js docs are explicit that the proxy should not be the only check,
so each page verifies the user again next to the data it loads.

### Supabase's new publishable and secret keys

**Choice:** Use the `sb_publishable_…` and `sb_secret_…` keys, not the legacy
`anon` and `service_role` JWTs.

**Why:** Supabase is steering new projects to these. A secret key can be revoked
and replaced on its own, while replacing a legacy key means rotating the JWT
secret for the whole project. Phase 1 does not use the secret key at all: every
query runs as the signed-in user.

### Database types are hand-written for now

**Choice:** `lib/supabase/database.types.ts` is written by hand to match the
migration.

**Why:** Generating it needs the Supabase CLI to be logged in and linked, which
is a manual step. Once that is done it will be regenerated with
`npx supabase gen types typescript --linked` and kept that way.

## Phase 2: Services and Google Drive

### One church Google account, connected once by an admin

**Choice:** An admin signs in once with the church Google account. The app keeps
that account's refresh token and uses it for every Drive action, whoever is
signed in to the app.

**Why:** Files have to be owned by the church account so they count against its
1 TB and stay put when volunteers leave. If each volunteer uploaded with their
own Google sign-in, the files would live in their personal Drives.

### The `drive.file` scope

**Choice:** The app asks Google only for `drive.file`.

**Why:** It is the narrowest Drive permission: the app can see and change only
the files and folders it created itself, nothing else in the church's Drive. That
is enough because the app creates the "RCW Media" folder and everything inside
it. It is also a "non-sensitive" scope, so Google does not require a security
review before the app can be published. The trade-off: a file someone drops into
those folders by hand in Drive is invisible to the app.

### Refresh token encrypted with AES-256-GCM, readable only with the secret key

**Choice:** The refresh token is encrypted with a key held in an environment
variable (`TOKEN_ENCRYPTION_KEY`) before it is stored. The table it lives in has
Row Level Security on and no policies, so no signed-in user can read it, not
even an admin. Only server code using the Supabase secret key can.

**Why:** Two separate things would have to leak (the database and the server's
environment) before anyone could reach the church's Drive. GCM also detects
tampering: a modified value fails to decrypt instead of producing garbage.
Because local development and the live site share one database, they must use
the same `TOKEN_ENCRYPTION_KEY`.

### Plain `fetch` instead of Google's SDK

**Choice:** `lib/google` calls Google's HTTP endpoints directly.

**Why:** The app needs four calls: exchange a code, refresh a token, create a
folder, start an upload. The official `googleapis` package is very large and
would slow every server start for the sake of those four.

### Saving the service never depends on Drive

**Choice:** Creating a service saves it first, then creates folders. If Drive
fails, the service is kept and marked `failed` with the reason, and its page
offers a retry. Folder creation records each folder ID as soon as it exists, so
a retry only makes what is missing.

**Why:** Google being slow, or the connection having expired, should not lose an
admin's work or leave duplicate folders behind after a retry.

### An expired connection is recorded, not just thrown

**Choice:** When Google rejects the refresh token, the connection row is marked
`expired`. Admins then see a "Reconnect Google" banner on the dashboard.

**Why:** The person who hits the failure may be a volunteer who cannot fix it.
Recording it means the next admin to open the app is told, instead of finding
out when uploads are already missing.

### Times are stored in UTC and shown in Pacific time

**Choice:** `services.starts_at` is a UTC timestamp. Forms take a Pacific date
and time and convert with `churchLocalToUtc`; every display formats back to
`America/Los_Angeles`.

**Why:** Vercel's servers run in UTC and a volunteer's phone could be in any
zone. Converting explicitly, with tests on both daylight-saving changeovers,
means "10:00" always means 10am at church.

## Phase 3: Uploads

### Files go from the phone straight to Google

**Choice:** Uploading is three steps. (1) The browser asks our server to start
an upload; the server uses the church account's token to open a Drive
"resumable upload session" and returns the session link. (2) The browser sends
the file's bytes directly to that link at Google. (3) The browser tells our
server the upload finished, and the server records it.

**Why:** Vercel limits request bodies to a few megabytes, far below a phone
video, so the bytes cannot pass through our server. The session link is safe to
hand to the browser: it works for that one file in that one folder and nothing
else, and the church account's real token never leaves the server. The server
passes the browser's origin when opening the session, which is what makes Google
accept the browser's cross-origin requests. This was tested against Google
before building on it.

### The server confirms every upload with Google

**Choice:** When the browser reports "done, the file ID is X", the server asks
Google whether X exists, is not in the bin, and sits in the folder that upload
was meant for. Only then is the row marked complete. Signed-in users have no
database permission to update upload rows at all; the server does it with the
secret key after that check.

**Why:** The upload record is the team's source of truth for who delivered
what. If the browser's word were enough, a bug or a tampered request could mark
files as delivered that do not exist, or attach someone else's file.

### 8 MB chunks, with resume

**Choice:** Files are sent in 8 MB pieces. If a piece fails, the app waits a
moment, asks Google (through our server) how many bytes it actually has, and
continues from there. After four failed tries in a row the file is marked
failed with a Retry button, and retrying continues the same session.

**Why:** Uploads happen on phones on church wifi or mobile data right after a
service. A dropped connection should cost a few megabytes, not a whole video.
The "ask through our server" step exists because Google does not let browsers
read the header that says how much it has stored.

### The upload queue is a plain class, not React state

**Choice:** `lib/uploads/queue.ts` is an ordinary TypeScript class. The upload
screen subscribes to it with `useSyncExternalStore` and draws whatever it
reports.

**Why:** Uploads are long-running work that must not restart or stall because a
component re-rendered. Keeping them outside React makes that impossible by
construction, and lets the resume logic be unit tested with scripted fake
network replies.

### `category_teams` added now, used fully in phase 5

**Choice:** The table mapping categories to receiving teams (with a deadline in
hours) is created in this phase.

**Why:** The rule for which uploads a viewer may see depends on it, and that
rule belongs in the uploads table's security policy from day one. Admin screens
for the mapping and the deadline logic come with handoffs in phase 5. Until
then no viewer can see any upload, which is the safe default.

### Accepted file types

**Choice:** Anything the browser reports as `image/*` or `video/*`, plus a list
of known extensions (HEIC, camera raw formats, MOV and so on) for when the phone
reports no type. Up to 20 GB per file.

**Why:** iPhones often report no type for HEIC photos, and the team's cameras
produce raw files. Rejecting those would push people back to uploading by hand.

## Phase 4: Gallery and search

### Thumbnails are fetched by our server, for people allowed to see them

**Choice:** The grid loads images from `/api/thumb/<upload id>`. That route
looks the upload up as the signed-in user (so Row Level Security decides whether
it exists for them), asks Drive for the file's preview link, fetches the image
and passes it on. Two sizes are served: 400px for the grid, 1600px for the
full-size view.

**Why:** Drive files are private to the church account, so a browser cannot
load them from Google directly. Going through our route also means the same
access rules apply to images as to everything else.

### Thumbnail caching is `private`, in the browser

**Choice:** Thumbnails are sent with `Cache-Control: private, max-age=86400`.
The server also remembers each file's preview link for ten minutes.

**Why:** `private` lets each person's browser keep an image for a day, so
scrolling back through an album is instant and costs nothing. It must not be
`public`: a shared cache could hand one person's permitted image to someone
who is not allowed to see it. The ten-minute memory saves a Drive call when the
grid image and the full-size image of the same photo are requested together.

### Plain `<img>`, not `next/image`

**Choice:** Gallery images use a normal `<img>` tag.

**Why:** `next/image` would send every thumbnail through Vercel's image
optimiser, which has a small free monthly allowance. Google already resizes the
image to the size we ask for, so there is nothing left for it to do.

### Small originals download through the app; large ones open in Drive

**Choice:** Files up to 50 MB (photos) are streamed through the app as a
download. Anything larger (videos) is opened in Google Drive instead: the app
gives that person's own Google account read access to the one category folder,
records the grant, and redirects them to the file in Drive.

**Why:** Vercel's free plan includes a limited amount of data transfer each
month. Photos are small enough to pass through it comfortably, and downloading
inside the app is the smoothest experience for the thumbnail team. A few
multi-gigabyte videos would use the allowance up, so those bytes go from Google
straight to the person. The cost is a second thing to keep correct, which is the
next decision.

### Drive access is granted lazily and removed on any access change

**Choice:** A Drive folder is shared with a person only at the moment they open
a large file in it, and only after Row Level Security has confirmed they may see
that category. Every grant is recorded in `drive_grants`. When an admin changes
someone's role, turns their access off, or changes their team, all of that
person's grants are removed; anything they are still entitled to is granted
again the next time they open it.

**Why:** Sharing folders with everyone up front would create thousands of
permissions that must all be kept in step with roles and teams. Granting on
demand keeps the number small, and "remove everything, re-grant on demand" is
one simple rule that cannot leave stale access behind. A removal that fails
(Google unreachable) stays marked in the table so the scheduled job in phase 7
can finish it.

### Search filters by the service's date

**Choice:** The gallery's date range filters on when the service took place, in
Pacific time, not on when the file was uploaded.

**Why:** "Baptism, May 2025" means photos of baptisms held in May, even if
someone uploaded them in June. The range covers whole days in the church's time
zone, so an evening service on the last day is included.

## Phase 5: Assignments and handoffs

### Database rules are tested against a real Postgres

**Choice:** `tests/db` starts PGlite (Postgres compiled to run inside Node),
applies every file in `supabase/migrations`, and then runs queries as an admin,
a member, viewers on different teams, and a signed-out visitor.

**Why:** Row Level Security and triggers are the real protection in this app,
and they are written in SQL, which TypeScript tests cannot reach. These tests
check the actual policies: a viewer on the wrong team gets no rows, a member
cannot promote themselves, an uninvited sign-up is rolled back. They also catch
a broken migration before it is pushed to the live database. PGlite needs no
Docker and is a free dev dependency. The harness adds small stand-ins for what
Supabase provides (the three API roles, `auth.users`, `auth.uid()`).

### Handoffs are maintained by database triggers

**Choice:** A `handoffs` row exists for every service, category and receiving
team. Triggers create them when a service is created, move their deadlines when
the service is rescheduled or the team's allowance changes, and add or remove
them when a category's teams change.

**Why:** Services will be created three ways: by an admin, by the recurring
schedule, and possibly by hand in the database. Triggers make handoffs correct
for all of them, where app code would have to remember to do it in each place.

### Status is worked out, not stored

**Choice:** A handoff stores three facts: when it is due, when the content
became ready, and when the team confirmed it. "Pending", "ready", "delivered"
and "late" are computed from those and the current time by `handoffStage`.

**Why:** "Late" becomes true just because time passes. A stored status would
need a job to flip it and would be wrong in between. Computing it is always
right, and the same function serves the dashboard and the Telegram alerts.

### When a category counts as ready

**Choice:** A category is ready for its teams when everyone assigned to it has
marked their task done. If nobody is assigned to it, it is ready as soon as one
file is uploaded.

**Why:** "Ready" should mean the team can start work without finding half the
photos missing. The people shooting know when they are finished; the first
upload does not. The fallback keeps small services, where nobody bothered to
assign anyone, from being stuck forever.

### Who gets chased

**Choice:** A task is outstanding when it is not marked done and that person
has uploaded nothing to that category for that service (`outstandingTasks`).

**Why:** Chasing someone who has already uploaded, but forgot to tap "done", is
how reminders get ignored. This one function decides both the "still to upload"
count on the dashboard and, in phase 6, who the Telegram bot tags.

### Marking done and confirming receipt go through database functions

**Choice:** `set_task_done` and `set_handoff_received` are Postgres functions.
Each checks the caller (the assigned person or an admin; someone on the
receiving team or an admin) and changes only the relevant timestamp. Signed-in
users have no direct write access to handoffs at all.

**Why:** Row Level Security can say which rows someone may update but not which
columns. A member needs to set "done" on their own task without being able to
reassign it; a viewer needs to set "received" without being able to move the
deadline. A function is the narrowest tool for that.

### Deleting is possible, deliberate, and recoverable in Drive

**Choice:** Admins can delete a single file from the full-size view, and can
delete a service together with its uploads by typing the service's name. In
both cases the Drive file or folder is moved to the Drive bin first, and only
then are the records removed. If Drive cannot be reached, nothing is deleted.
The database still refuses to delete a service that has upload records, so the
app removes those explicitly, in that order.

**Why:** At first a service with uploads could not be deleted at all, to protect
the record of who delivered what. That turned out to be too strict: test data
has to be cleared before real use, and mistakes happen. Typing the name makes an
accidental delete very unlikely, and the Drive bin keeps the files themselves
restorable for 30 days. Doing Drive first means a failure never leaves files in
Drive with no record pointing at them. The upload records are not recoverable,
and the screen says so before the button unlocks.

## Phase 6: Telegram bot

### The webhook checks a secret header before anything else

**Choice:** `/api/telegram/webhook` compares the
`X-Telegram-Bot-Api-Secret-Token` header with `TELEGRAM_WEBHOOK_SECRET`, using a
constant-time comparison, and answers 401 if it does not match. The secret is
handed to Telegram once, when the webhook is registered.

**Why:** The webhook URL is public, so anyone could post fake "messages" to it.
The secret is the only thing proving a request came from Telegram. A
constant-time comparison avoids leaking, through response timing, how much of a
guessed secret was right. After that check the route always answers 200, because
any other status makes Telegram re-deliver the same message repeatedly.

### Linking accounts with one-time links and a Confirm button

**Choice:** `/join` (in a private chat) and `/linkgroup` (in the group) make the
bot reply with a link containing a random token. Opening it shows what will be
connected and a Confirm button. The token works once, for 15 minutes, and only
its SHA-256 hash is stored.

**Why:** The bot knows a Telegram ID; the app knows a Google account; something
must prove the same person holds both. Only someone who can read the bot's reply
and sign in to the app can complete the link. `/join` is refused in groups,
where another member could open the link and attach their app account to
someone else's Telegram. The Confirm button matters because chat apps open
links automatically to build previews, which would otherwise use the link up.
Storing only the hash means a database leak does not expose working links.

### Tagging by Telegram ID

**Choice:** People are tagged with `<a href="tg://user?id=…">Name</a>` in
HTML-format messages. Every name and title is escaped before it goes in.

**Why:** `@username` tags only work for people who have set a username; the ID
form notifies anyone. Escaping stops a service called `<b>Sunday` from breaking
the message or injecting formatting.

### Each message is sent once, enforced by the database

**Choice:** Before sending, the app inserts a row into `notification_log` with a
unique key such as `handoff_late:<id>`. If the insert fails because the key
exists, the message was already sent and is skipped. If Telegram rejects the
message, the row is removed so it is tried again later.

**Why:** Notifications are triggered from several places (a scheduled job, and
straight after uploads and task changes), possibly at the same moment. A unique
key in the database is the one place that can guarantee "once" across all of
them. Checking first and inserting afterwards would let two callers both see
"not sent yet".

### Notifications are a sweep, not events

**Choice:** `sendDueNotifications` looks at current state and sends whatever is
due: reminders whose time has come, handoffs that became ready, handoffs past
their deadline. It runs after relevant actions and (from phase 7) on a schedule.

**Why:** "Late" is caused by time passing, not by any action, so something has
to look periodically anyway. Using the same sweep for everything means a
message missed because Telegram was down is simply picked up on the next run.
Nothing that fell due before the group was linked is sent, so switching Telegram
on does not flood the group with old alerts.

### Reminder timing

**Choice:** Upload reminders go out 3 hours and 20 hours after a service starts,
and only tag people with something outstanding. If nobody owes anything, nothing
is posted.

**Why:** Three hours gives people time to get home. Twenty hours lands before
the usual 24-hour handoff deadline while there is still time to act. A reminder
that tags people who already delivered teaches everyone to ignore the bot.

### Telegram is optional

**Choice:** With no bot token, or no linked group, every notification function
quietly does nothing, and nothing a person does in the app waits on Telegram
(messages are sent after the response using `after`).

**Why:** The team's work must not stop because Telegram is slow, down, or not
set up yet.

### API routes answer 401 when signed out

**Choice:** For signed-out requests, `proxy.ts` redirects page visits to the
login page but answers `/api/` calls with a JSON 401.

**Why:** A redirect is right for a person visiting a page. For a script, the
login page arriving as a "successful" reply is confusing: an upload whose
session expired midway would have failed with a meaningless error instead of
"you have been signed out".

## Phase 7: Scheduled jobs and recurring services

### Supabase `pg_cron` every 15 minutes, Vercel Cron once a day as backup

**Choice:** Postgres itself, through the `pg_cron` and `pg_net` extensions,
calls the app's `/api/cron/run` every 15 minutes. `vercel.json` also schedules
the same address once a day.

**Why:** The three free options were compared against what the app needs.
Reminders are due 3 and 20 hours after a service and late alerts when a deadline
passes, so the timer has to tick at least a few times an hour.

- **Vercel Cron (Hobby):** runs at most once a day, at an unpredictable minute
  within the hour. Fine for creating next week's service, far too coarse for
  reminders.
- **GitHub Actions schedule:** free, but runs are often delayed by many minutes
  at busy times and GitHub disables schedules on repositories with no recent
  activity.
- **Supabase `pg_cron`:** runs inside the database the project already has, to
  the minute, for free.

Using both costs nothing. The daily Vercel run means a stopped or misconfigured
Supabase schedule degrades the app (things happen late) instead of breaking it
(next Sunday's service never appears). It also touches the database every day,
which keeps a free Supabase project from being paused for inactivity.

### The schedule is set up by hand, not in a migration

**Choice:** The `cron.schedule` statement lives in
[SCHEDULER.md](SCHEDULER.md) and is run once in the Supabase SQL editor.

**Why:** It contains two things that do not belong in the repository: the live
site's address and a reference to a secret. It also needs extensions that the
in-process test database does not have, so putting it in a migration would
break the database tests. The secret itself is stored in Supabase Vault, where
it is encrypted, and read by the schedule at run time.

### One endpoint, independent steps

**Choice:** `/api/cron/run` runs every job in turn. Each step is wrapped so a
failure in one (Google is down, say) is recorded and the others still run. The
time and outcome of the last run are saved and shown on Admin → Schedule.

**Why:** One address means one schedule and one secret to manage. The saved
result turns a silent failure into something an admin can see: the page shows
"Not running regularly" if two hours pass without a run.

### Every job can be run twice safely

**Choice:** Creating a recurring service relies on a unique index on
(series, occurrence). Notifications rely on a unique key per message. Folder
creation saves each folder as it is made.

**Why:** Two schedulers call the same endpoint, an admin can press "Run now",
and a slow run can overlap the next one. Rather than trying to prevent
overlap, each job is written so that doing it again changes nothing.

### A recurring service remembers which occurrence it is

**Choice:** A service created from a schedule stores `series_slot`, the
occurrence it was created for, separately from `starts_at`. Deleting such a
service records a "skip" for that occurrence.

**Why:** Without it, moving next Sunday's service from 10:00 to 11:00 would
make the job think 10:00 was missing and create a second one, and deleting a
cancelled service would see it reappear fifteen minutes later.

### Recurrence is "weekday and time at church"

**Choice:** A series stores a weekday and a wall-clock time. The actual instant
is computed each week in `America/Los_Angeles`.

**Why:** Storing "every 168 hours from a first date" would drift by an hour
twice a year. "Sunday at 10:00" should mean 10am at church in both winter and
summer, and the tests check the weeks either side of both clock changes.

## Phase 8: Finishing

### The main-flow test runs against a throwaway stack, not the real project

**Choice:** `tests/e2e/main-flow.spec.ts` drives a real browser through
"create a service, upload a photo, see it in the album and the gallery". In CI
it runs against a local Supabase started with `supabase start` (a real Postgres
with every migration and the seed, plus the real auth and API services) and a
small fake Google Drive server (`tests/e2e/fake-google.mjs`).

**Why:** The flow crosses every layer: sign-in, Row Level Security, server
actions, the upload endpoints, the browser uploading to "Google", the server
confirming the file, thumbnails and downloads. Mocking those inside the app
would test the mocks. Running against the real project would put test data in
front of the team and need real secrets in CI. A throwaway stack exercises the
real code paths with nothing real at stake.

Only Google is faked, at the network edge: the app makes the same HTTP calls it
makes to Drive, and the fake answers them. The switch that redirects those
calls (`E2E_FAKE_GOOGLE_URL`) is ignored on any Vercel deployment, so the live
site cannot be pointed at a fake.

### Signing in for the test

**Choice:** The test creates an invited admin with a password through the local
Supabase's admin API, signs in with it, and gives the browser the resulting
session cookies.

**Why:** The app only offers Google sign-in, which an automated test cannot
complete. Password sign-in exists only in the local test stack; the session it
produces is the same kind of cookie the app normally sets, so everything after
sign-in is the real path, including the invite gate that runs when the user is
created.

### It runs in CI, and is skipped where there is no Docker

**Choice:** Without the local Supabase settings the main-flow test is skipped
and only the signed-out browser tests run.

**Why:** A local Supabase needs Docker and a few gigabytes of images, which is
too much to require for every `npm run test:e2e` on a laptop. GitHub Actions
has Docker, so the test runs on every push, which is where it matters.

### Seed data is checked by a test

**Choice:** `supabase/seed.sql` builds a believable week (people, teams, last
Sunday partly delivered, next Sunday planned) with dates computed from "now".
`tests/db/seed.test.ts` applies it to the in-process Postgres and asserts the
state it is meant to produce.

**Why:** The seed is what CI's Supabase starts with, so a mistake in it would
stop the main-flow test from running at all. Testing it also keeps it honest as
the schema changes: a migration that breaks the seed fails a test instead of
being discovered months later.

## Redesign, part 1: foundation

### A new design system, because the first one came out plain

**Choice:** Replace the light, Airbnb-based design with a dark one adapted from
Spotify's system: charcoal surfaces, bold type, pill buttons, and photos used
wherever a screen can show them. Details are in [DESIGN.md](DESIGN.md).

**Why:** The first version was built from design tokens without ever being seen
with real content, and it showed: white pages of text in boxes, no imagery in a
photo app, and admin sections two clicks deep. The team is meant to want to open
this after a service. A media library looks best when the interface recedes and
the pictures carry the colour, which is exactly what that system is designed for.

Because every screen was already built from named tokens (`canvas`, `ink`,
`surface`), changing the values restyled the whole app at once. The screens are
then being restructured one area at a time.

### Screens are split into "load the data" and "draw it"

**Choice:** The home page is now two parts. `lib/dashboard.ts` gathers
everything and returns one plain object. `components/dashboard/dashboard-view.tsx`
takes that object and draws it, and knows nothing about the database.

**Why:** It makes the screen previewable. `/preview/dashboard` passes the same
view a hand-written sample object, so the design can be looked at, at phone and
desktop sizes, without signing in or having data. Building the first version
blind was the root cause of it looking plain; this fixes the cause. The very
first preview also caught a bug that the type checker could not.

### Preview pages exist only in development

**Choice:** `/preview/*` returns 404 when `NODE_ENV` is `production`, and the
sign-in bypass for it in `proxy.ts` is only added outside production.

**Why:** They show fake data with no sign-in, which is exactly what must never
be reachable on the live site.

### Analytics are counted in the database

**Choice:** A Postgres function, `upload_analytics`, returns the dashboard's
counts (per week, per category, per person, totals) as one JSON object. It is
`security invoker`, so it runs as the person asking and Row Level Security
still applies.

**Why:** Supabase's API returns at most 1,000 rows per request. Counting uploads
in the app would work in testing and then quietly under-count once the library
grew. Counting in SQL is correct at any size and is one fast request. Because
RLS applies, a viewer's numbers cover only what their team may see, with no
extra code.

### Weeks run Sunday to Saturday, in Pacific time

**Choice:** The weekly chart groups uploads into weeks starting on Sunday on the
church's calendar, and shows every week including empty ones.

**Why:** A church week is a Sunday service and everything uploaded after it.
Monday-start weeks would split one service's uploads across two columns. Empty
weeks are kept because a missing week is exactly what an admin should notice.

### What the handoff figures count

**Choice:** "On time" counts a handoff once its outcome is known: confirmed by
its deadline (on time), confirmed after it or still unconfirmed past it (late).
Handoffs still inside their deadline are left out. "Typical time to deliver" is
the median, not the average.

**Why:** Counting not-yet-due handoffs as late (or as on time) would make the
figure swing every Sunday for no reason. The median is used because one handoff
confirmed a week late would drag an average far from what is normal.

### Charts use one colour and write their numbers out

**Choice:** Columns and bars are all the accent violet. Values are printed next
to every bar, and the column chart has the same data as a hidden table.

**Why:** Each chart answers "how many", and one hue is the clearest way to show
amount. Using a different colour per category would add decoration without
adding information, since the labels already say which is which, and it would
make the charts harder to read for colour-blind people.

## Redesign, part 2: fewer clicks

### Uploading is available everywhere, not on one page

**Choice:** One upload sheet, opened from an Upload button in the sidebar, a
round button in the middle of the phone tab bar, and "add" buttons on each
service and album. It lives in the app shell, with a single queue for the whole
session, so uploads continue while the person moves between pages. A small pill
shows progress when the sheet is closed.

**Why:** Uploading is the reason most people open the app, and it used to take
four steps: open Services, find the service, scroll to the upload card, pick a
category. Now it is one tap from anywhere, with the most likely service already
chosen. Keeping the queue in the shell (which Next.js does not re-render on
navigation) is what lets a video keep uploading while someone checks the
gallery.

### The sheet never guesses which service you meant

**Choice:** The sheet starts with a short list: services from the last two
weeks and the coming week. If Upload is tapped for a service that is not in
that list (an older one, or one created a moment ago), the sheet fetches that
service before showing anything. If it cannot take uploads, it says so.

**Why:** The obvious shortcut, falling back to the first service in the list,
would send someone's files to the wrong service without telling them. A wrong
destination is worse than a short wait.

### Albums instead of a list of categories

**Choice:** A service page shows each category as an album card with its newest
photos, its file count, where it is being delivered and how that is going, and
an add button. The team, their tasks and the handoffs sit beside the albums on
a computer and below them on a phone.

**Why:** The old page was six stacked cards of text. The things people look for
(is there anything in Preacher yet, has Thumbnails got theirs) needed reading
several of them. Photos answer the first at a glance and the delivery chip
answers the second, on the card itself.

### Category chips in the gallery

**Choice:** The gallery's category filter is a row of chips that apply
instantly. Service and date filters are folded behind "Service and dates".

**Why:** Category is the filter people use most ("show me baptisms"). It used
to need a dropdown and a Search button. The less common filters are still
there without taking up the screen.

### A service with no photos shows its date as the cover

**Choice:** In the services list, a service without any photos shows a
calendar-style tile with its day, month and weekday.

**Why:** Upcoming services never have photos, so the list was a row of empty
grey squares. The date is the most useful thing to show in their place.

## Redesign, part 3: admin screens

### Things look like what they are, several to a row

**Choice:** Categories are drawn as folders (a tab, a name, and where the
contents go). Teams and people are cards with avatars. Weekly services are
calendar tiles showing the weekday and time. Each grid ends with a dashed
"new" tile. Tapping a card opens a panel with its controls.

**Why:** The first redesign pass left the admin screens as full-width rows of
form fields: one category took a whole row, and its meaning (a folder every
service gets) was not visible. A folder shape says what a category is before a
word is read, and a grid shows the whole set at once. Moving the controls into
a panel keeps each card small and readable; the settings are one tap away for
the rare times they are changed.

### One panel component

**Choice:** `components/ui/modal.tsx` is a button that opens a panel: a sheet
from the bottom on phones, a centred dialog on larger screens. It uses the
browser's own `<dialog>` element.

**Why:** The native dialog gives focus trapping, closing with Escape, and a
backdrop for free, and is accessible without a library. Every admin card uses
the same component, so they all behave the same way.

## Share links

### A long random link is the permission

**Choice:** A share link is `/s/<token>`, where the token is 32 random bytes.
Whoever holds the link can see what it covers; nobody else can. Only admins
can create, see or turn off links. A link can expire (7, 30 or 90 days, or
never) and can be turned off at any time.

**Why:** Church leaders want specific photos, especially baptisms, without
being added to the media team's app. Giving them an account means invites,
roles and a team for every pastor. A link is how people already share photo
albums, and needs nothing from the recipient. The trade-off is that a link can
be forwarded, which is why links expire, can be turned off, show how often
they have been opened, and say on the page not to pass them on. For the other
case you raised (one person wanting one picture), downloading it and sending
it yourself is still the right tool, and needs no link at all.

### What a link covers is fixed when it is made

**Choice:** A link covers one of four things: one album (a category of one
service), one category across every service, one whole service, or the whole
gallery. It is created from the Share button on that thing, and the form spells
out what will be visible before the link exists.

**Why:** "All baptisms" should keep working as new baptisms are uploaded, so a
link stores a scope, not a list of files. Making the link from the page it
covers means there is no separate "choose what to share" step to get wrong.
Wide links (a service, a category, everything) carry an extra warning that
they include whatever is added later.

### Visitors never touch the database; scope is enforced in one file

**Choice:** A visitor has no account, so Row Level Security cannot decide what
they see. The server reads on their behalf with the secret key, and
`lib/share/server.ts` is the only place that does: `findActiveShare` decides
whether a link works, and `findSharedUpload` decides whether one file is inside
its scope. The image and file routes for share links go through both.

**Why:** Everywhere else in the app the database enforces access. Here the
server must, so the check is kept in one small, tested place where it is hard
to forget. A wrong token, an expired link, and a file outside the link's scope
all get the same plain "not found", which tells a guesser nothing about what
exists. The end-to-end test opens a link in a signed-out browser and checks
that the link works, that a made-up token does not, that the app's own routes
still refuse the visitor, and that turning the link off stops it at once.

### Links can be copied again later

**Choice:** The token is stored as it is, so an admin can copy a link again
from Admin, Shared links.

**Why:** The one-time Telegram links store only a hash, because they are used
within minutes. A share link lives for weeks and gets re-sent ("can you send me
that link again?"). The table can only be read by admins, who can see
everything the link shows anyway, so storing it gives nothing away to them.

### Large videos use Google Drive's "anyone with the link"

**Choice:** Photos (up to 50 MB) are streamed through the app. For a larger
video, that one file is switched to "anyone with the link can view" in Google
Drive and the visitor is sent there. Each time is recorded, and the file is
made private again when the share link expires or is turned off (the scheduled
job retries if Drive cannot be reached).

**Why:** Streaming multi-gigabyte videos through Vercel would use up the free
plan's data allowance. Signed-in team members get Drive access to their own
Google account; a visitor has no account to give it to, so the file itself has
to be opened up. It is done per file, only when someone asks for it, and
undone afterwards, so nothing stays open longer than the link that needed it.

### "Allow downloads" off means the originals are not served

**Choice:** With downloads off, the page shows previews only. The file route
refuses, and videos are not opened in Drive (which would let them be saved).

**Why:** Hiding a button is not a control. The server refusing the request is.
A preview can still be screenshotted, which the option's wording is honest
about: it says they can look but not save the originals.

## Services every other week

### A repeat interval plus a first date

**Choice:** A repeating service has an interval of 1 to 4 weeks. When it is
not every week, it also has a first date, which fixes the weeks it falls on.
Two series on the same weekday, every other week, starting a week apart,
alternate (the women's midweek one Wednesday, the men's the next).

**Why:** That is the church's real pattern, and two simple series express it
without a special "alternating" type. Counting whole weeks from a fixed first
date keeps the rhythm exact across daylight-saving changes and across any gap
in when the job runs. The database refuses a first date on the wrong weekday,
and an interval above 1 without a first date, so the schedule cannot quietly
drift. Patterns like "the first Sunday of each month" are a different rule and
are not covered yet.

## Announcing a service on its day

**Choice:** The Telegram post with a service's upload link goes out at 7:00 AM
(Pacific) on the day of the service, or two hours before it if it starts
earlier than 9:00 AM. It tags the people covering it, with what each is
uploading. Creating a service, by hand or from the schedule, posts nothing.

**Why:** Recurring services are created a week ahead, so announcing them on
creation put a link in the group a week early, where it was buried by the time
anyone needed it. On the morning of the service, it is the link people are
about to use. The post comes from the same scheduled sweep as reminders, with
the same once-only key, so it is sent exactly once; a service created later
that same day is announced within a few minutes, and one whose day has passed
is never announced. A service without its Drive folders is not announced,
because there would be nowhere to upload.

## One "who uploaded what" message per service

**Choice:** When someone's batch of uploads finishes, the bot posts a message
in the team group listing who uploaded what for that service ("✅ Daniel
uploaded 24 photos to Baptism"). It is one message per service: later batches
edit it to add or update their line, rather than posting again. Names are not
tagged.

**Why:** The team wanted to see uploads land without the group filling up. A
message per file, or even per batch, would bury the reminders and handoff
alerts that people need to act on. The upload sheet reports when a batch ends,
so the post is immediate; the scheduled sweep catches a batch whose sheet was
closed before it could report, but only once no file has finished for two
minutes, so a batch still going up is not edited once per file. The message ID
and the last text sent are kept in `notification_log`, so the sweep edits only
when something changed, and two callers cannot both send or both edit.

## A light look in the logo's colours

**Choice:** The app is light by default, in the royal blue of the RCW LA Media
logo, with white cards on a pale blue-grey page. The dark charcoal design is
replaced by an optional deep-navy dark mode (Light, Dark or Auto, remembered on
each device). The logo replaces the "R" mark and is the browser and home-screen
icon.

**Why:** People found the charcoal design gloomy and generic. The church already
has a brand, and using it makes the app feel like the media team's own. A light
page also suits a church audience who mostly open the app in daylight on their
phones. The choice is stored in the browser, not the database: it is a
per-device preference, and a small script applies it before the page draws, so
there is no flash of the wrong theme.

## Counting people, not page loads, on share links

**Choice:** Each browser that opens a share link gets a random visitor ID in a
cookie. Shared links shows how many different people opened a link, how many
visits there were (a visitor counts again only after half an hour away) and how
many files were downloaded.

**Why:** The old count went up on every page load, so one pastor refreshing
five times looked like five people. A random ID tells browsers apart without
sign-in and without storing anything about the person. It cannot tell one
person on two devices apart from two people, and someone who clears cookies
counts again; for "did they look at it, and did they take anything", that is
close enough.

## Regions

**Choice:** The church's regions (Metro Heights, OC, West Valley and any added
later) are rows in a `regions` table, managed under Admin → Regions. Every
service and weekly schedule belongs to one region. People belong to one or more
regions and see only those. Overall admins (role "admin") are in every region;
a region admin is a member who runs one region's services, schedule, people,
share links, Drive and Telegram group. Categories, teams and duty roles stay
shared by every region.

Storage: a region keeps its files in its own folder in the church Drive, unless
it connects its own Google account. Each service records which account holds
its files (`drive_region_id`), so a region can switch either way without
breaking older services, and Drive calls always use the right account.

Telegram: a region posts to its own group if one is linked (`/linkgroup`, then
"For <region>"), otherwise to the church's main group, where its services are
labelled with the region's name.

Everything that existed before regions became the first region, "Main". Its
Drive folder is the existing "RCW Media" folder, so no files moved. While there
is only one active region, new services, schedules and invites go into it
without anyone choosing.

**Why:** The church wants each region to run its own media without seeing the
others', at no extra cost. Enforcing regions in Row Level Security, like every
other permission, means a mistake on a page cannot leak another region's
photos. Letting a region bring its own Google account spreads storage across
accounts the church already has, instead of paying for more; defaulting to the
church Drive keeps setup to nothing for a new region. Shared categories and
teams keep names the same everywhere, so a church-wide share link of "every
Baptism" still makes sense.
