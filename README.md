# Pitch Vote — real-time live voting for events

A Kill Tony-style audience voting app for pitch/demo events. The audience scans a
QR code, votes 👍 Continue / 👎 Stop on their phone, and a projector screen shows
the live percentage. If **≥ 50 % of the people currently in the session** vote
thumbs up, the pitcher continues.

Built to be **temporary**: one command to deploy before the event, one command
to delete everything afterwards. Runs entirely on **Cloudflare**.

## Stack

| Layer     | Tech                                                                  |
| --------- | --------------------------------------------------------------------- |
| Frontend  | React + Vite (TypeScript), dark mobile-first UI                       |
| Hosting   | Cloudflare Workers static assets                                      |
| Real-time | WebSockets to a Cloudflare Durable Object (hibernation API)           |
| Storage   | The Durable Object's built-in storage                                 |
| Auth      | None — no accounts for the audience                                   |

Everything is one Worker (`ai-motion-voting`), configured in `wrangler.jsonc`:

```
browser ──HTTP──▶ Worker ──▶ static files from dist/
        ──WS /api/ws──▶ Worker ──▶ EventRoom Durable Object ("main")
                                     • session, timer, presenters, votes
                                     • pushes state to every open socket
```

## Screens

| Route       | Who         | What                                                                   |
| ----------- | ----------- | ---------------------------------------------------------------------- |
| `/#/`       | Audience    | Current pitcher, stage timer, two big vote buttons, link to the AI Motion page on Lead Bounty. |
| `/#/admin`  | Organizer   | Presenter queue (CSV import, reorder, next / random pick), stage timer controls, manual pitcher override, live stats, join QR. |
| `/#/display`| Projector   | AI Motion logo, pitcher, big stage timer, live percentage with 50 % marker, connected count, join QR. |

(Hash routing is used on purpose — no rewrite rules needed.)

## How it works

- **One room per event.** A single Durable Object (`EventRoom`, named `main`)
  holds all state: current pitcher, a `round` counter, the stage timer, the
  presenter queue and every device's vote. It is persisted in the object's
  storage, so it survives restarts and redeploys.
- **Real-time.** Every screen keeps one WebSocket open to the room
  (`/api/ws?role=audience|display|admin`). Any change is pushed to all
  sockets immediately; vote bursts are coalesced into one update per 150 ms.
- **Presence.** An open audience socket *is* presence — no database writes.
  Phones send a `ping` every 20 s (answered by Cloudflare without waking the
  object); a socket silent for 60 s stops counting, and a 15 s check
  updates the count when that happens. Each device has a UUID in
  `localStorage`, so one device = one vote, even across reloads or tabs.
- **Voting.** A vote is stored with the round it was cast in. Only votes for
  the current round count. Phones reconnect automatically (and immediately
  when brought back to the foreground).
- **Reset votes.** The admin bumps `round` — everyone's vote clears instantly.
- **Timer.** The server stores when the timer ends, in its own clock, and sends
  its time with every update, so all screens show the same countdown even if a
  device's clock is off.
- **The math.** `percentage = 👍 votes from connected devices / connected devices`.
  Not voting counts against the pitcher, per the ≥ 50 %-of-the-room rule.
- **Code layout.** `worker/` = Worker + Durable Object, `src/` = React app,
  `shared/protocol.ts` = the message types both sides use.

## Local development

```bash
npm install
npm run dev        # builds the app, runs the Worker + Durable Object locally
                   # → http://localhost:8787
```

For hot reload while working on the UI, keep `npm run dev` running and in a
second terminal run `npm run dev:ui` (Vite on http://localhost:5173, which
proxies `/api` to the local Worker).

Local state lives in `.wrangler/`; delete that folder to start fresh.

## Deploy for the event

You need a Cloudflare account (the free plan is enough).

**From your machine:**

```bash
npx wrangler login     # once
npm run deploy         # build + deploy
```

Wrangler prints the URL, e.g. `https://ai-motion-voting.<your-subdomain>.workers.dev`.

**Or from GitHub (deploys on every push):** Cloudflare dashboard → **Workers &
Pages → Create → Import a repository** → pick this repo, then set:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Then:

1. Open `https://<url>/#/admin` and upload the presenter CSV.
2. Put `https://<url>/#/display` fullscreen on the projector.

A custom domain can be added under the Worker's **Settings → Domains & Routes**.

### Event-day flow

1. Before the event, on `/#/admin` → **Upload CSV** with the presenters
   (see format below). Drag rows or use ↑/↓ to set the running order, or
   **Shuffle remaining**.
2. Audience scans the QR → lands on the vote page, is counted immediately.
3. **Next in order** (or **Pick random**, or a row's **On stage**) puts a
   presenter on stage: votes reset and the timer is reset (paused) to the last
   length used. The presenter is marked *Done* in the list.
4. **Start 2:00** / **Start 3:00** starts the stage timer; **Pause / Resume**
   and **Reset** (back to the last length) as needed. The timer shows on the
   display and on audience phones.
5. Audience votes; display updates live; ≥ 50 % green = continue.

The *Current pitcher* card still lets you type a name manually.

### Presenter CSV

One presenter per row. A header row is optional:

```csv
Full Name,Project Name
Jane Doe,RoboBarista
"Smith, Bob",PitchPal
```

- With a header, columns are matched by name (`name`/`presenter`, `project`).
  Without one, columns are read in order: name, project. Any other columns
  are ignored.
- Comma- or semicolon-separated (Excel exports both); quoted fields are fine.
- Uploading replaces the current list (you are asked to confirm).

### Branding

- **Logo:** replace `public/ai-motion-logo.svg` with the real logo (a
  placeholder is committed). To use a PNG, change `LOGO_SRC` in `src/config.ts`.
- **Lead Bounty link** on the mobile page: https://leadbounty.io/ai-motion
  (`AI_MOTION_PAGE_URL` in `src/config.ts`).
- **Timer presets:** `TIMER_PRESETS_MIN` in `src/config.ts`.

## Tear down after the event

```bash
npm run destroy        # = wrangler delete
```

This deletes the Worker, its static files **and** the Durable Object with all
its stored data (presenters, votes). Or in the dashboard: **Workers & Pages →
ai-motion-voting → Settings → Delete**.

To reuse the app for another event without redeploying, use **Clear list** and
**Reset votes** on the admin page.

## Notes & limits

- One event at a time; no audience accounts; no admin login — anyone with the
  URL can open `/#/admin`, so don't share that path publicly.
- A single Durable Object handles thousands of simultaneous WebSockets, far
  more than a room of people.
- Presence is ping-based (20 s ping / 60 s window): someone whose phone loses
  signal drops out of the count within about a minute; someone who closes the
  tab drops out immediately.
- Cost: well within the Workers free plan for an event (requests, Durable
  Object usage and storage are all tiny; idle sockets hibernate).
