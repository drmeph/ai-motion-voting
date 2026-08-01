# Pitch Vote — real-time live voting for events

A Kill Tony-style audience voting app for pitch/demo events. The audience scans a
QR code, votes 👍 Continue / 👎 Stop on their phone, and a projector screen shows
the live percentage. If **≥ 50 % of the people currently in the session** vote
thumbs up, the pitcher continues.

Built to be **temporary**: spin the whole stack up before the event, delete it
completely afterwards.

## Stack

| Layer     | Tech                                                              |
| --------- | ----------------------------------------------------------------- |
| Frontend  | React + Vite (TypeScript), dark mobile-first UI                   |
| Hosting   | AWS Amplify Hosting                                               |
| Real-time | AWS AppSync (GraphQL subscriptions via Amplify Gen 2 `defineData`)|
| Database  | DynamoDB (on-demand, created by Amplify)                          |
| Auth      | Public API key — no accounts for the audience                     |

## Screens

| Route       | Who         | What                                                                   |
| ----------- | ----------- | ---------------------------------------------------------------------- |
| `/#/`       | Audience    | Current pitcher + two big vote buttons. Votes can be changed any time. |
| `/#/admin`  | Organizer   | Set/update pitcher, live stats, reset votes, join QR code.             |
| `/#/display`| Projector   | Huge live percentage, progress bar with 50 % marker, connected count, join QR. |

(Hash routing is used on purpose — no rewrite rules needed on the static host.)

## How it works

- **One session per event.** A single `Session` record (`id: "main"`) holds the
  current pitcher and a `round` counter.
- **Presence.** Each audience device registers a `Participant` record
  (UUID stored in `localStorage`, so one device = one vote) and heartbeats
  `lastSeenAt` every 20 s. Anyone seen in the last 60 s counts as "in the session".
- **Voting.** A vote writes `vote` + `votedRound` onto the participant's record.
  Only votes matching the session's current `round` count.
- **Reset votes.** The admin bumps `round` by one — a single write, no need to
  touch participant records. Everyone's UI clears instantly.
- **Real-time.** All screens use AppSync subscriptions (`observeQuery`) on
  `Session` and `Participant`, so votes, pitcher changes, and resets propagate
  to every phone and the projector instantly.
- **The math.** `percentage = 👍 votes from active participants / active participants`.
  Not voting counts against the pitcher, per the ≥ 50 %-of-the-room rule.

## Local development

Prereqs: Node 18+, an AWS account, AWS credentials configured locally
([Amplify guide](https://docs.amplify.aws/react/start/account-setup/)).

```bash
npm install

# Terminal 1 — deploy a personal cloud sandbox (AppSync + DynamoDB),
# writes amplify_outputs.json when ready and watches for changes:
npx ampx sandbox

# Terminal 2 — frontend dev server:
npm run dev
```

Open `http://localhost:5173/#/admin`, set a pitcher, then open `/#/` and
`/#/display` in other tabs/devices.

The app builds without a backend too — it shows a "Backend not configured"
screen until `amplify_outputs.json` exists.

## Deploy for the event (Amplify Hosting)

1. Push this repo to GitHub.
2. AWS Console → **Amplify** → **Create new app** → connect the GitHub repo and
   pick your branch. Amplify detects `amplify.yml` and this as a Gen 2 fullstack
   app.
3. Accept the defaults (Amplify creates/uses a service role that lets the build
   deploy the AppSync + DynamoDB backend) and **Save and deploy**.
4. After the build finishes (~5–10 min) you get a URL like
   `https://main.xxxxxxxx.amplifyapp.com`.
5. Open `https://<app-url>/#/admin` — the admin page creates the session record
   on first load and shows the audience QR code.
6. Put `https://<app-url>/#/display` fullscreen on the projector.

Everything (frontend build + AppSync API + DynamoDB tables) deploys from that
one branch build — there is no separate backend deployment step.

### Event-day flow

1. Audience scans the QR → lands on the vote page, is counted immediately.
2. Admin types the pitcher's name + project → **Set pitcher & reset votes**.
3. Audience votes; display updates live; ≥ 50 % green = continue.
4. Next pitcher → repeat step 2 (the round bump clears all votes).

## Tear down after the event

Everything lives in one Amplify app, so removal is one action:

- **Console:** Amplify → your app → **App settings → General → Delete app**.
  This deletes the hosting **and** the backend CloudFormation stack
  (AppSync API, DynamoDB tables, API key).
- **Sandbox** (if you used one for development): `npx ampx sandbox delete`.

Verify: CloudFormation console → confirm the `amplify-…` stacks are gone
(in the region you deployed to). DynamoDB and AppSync consoles should show no
leftover resources. Cost after deletion: $0.

## Notes & limits (V1)

- One event/session at a time; no audience accounts; no admin login — anyone
  with the URL can open `/#/admin`, so don't share that path publicly.
- The AppSync API key expires after 30 days as a safety net; the stack is meant
  to be deleted well before that.
- Presence is heartbeat-based (20 s beat / 60 s window), so someone closing
  their browser drops out of the count within a minute.
- Costs during the event are effectively pennies: DynamoDB on-demand +
  AppSync per-request/subscription pricing, no idle servers.
