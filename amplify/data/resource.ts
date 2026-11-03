import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * Single-event live voting schema.
 *
 * Session  – exactly one record (id: "main"). Holds the current pitcher and a
 *            monotonically increasing `round` counter. Bumping `round` is how
 *            votes get "reset": only votes cast in the current round count.
 * Participant – one record per audience device (client-generated UUID).
 *            Carries the participant's vote, the round it was cast in, and a
 *            lastSeenAt heartbeat used for live presence counting.
 * Presenter – the running order imported from a CSV on the admin page.
 *
 * Everything is exposed via public API key so the audience needs no accounts.
 * The API key (and the whole stack) is temporary by design.
 */
const schema = a.schema({
  Session: a
    .model({
      pitcherName: a.string(),
      projectName: a.string(),
      round: a.integer().required().default(0),
      // Presenter (from the CSV queue) currently on stage, if any.
      currentPresenterId: a.id(),
      // Stage timer, shared by every screen. The admin's device is the only
      // writer. While running, clients count down to timerEndsAt (epoch ms);
      // while paused, timerRemainingMs is the frozen value.
      timerDurationMs: a.float(),
      timerRemainingMs: a.float(),
      timerEndsAt: a.float(),
      timerRunning: a.boolean(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  Participant: a
    .model({
      vote: a.string(), // 'up' | 'down' | null
      votedRound: a.integer(),
      // Epoch milliseconds. Float, not integer: GraphQL Int is 32-bit and
      // Date.now() overflows it, while Float (a double) is exact up to 2^53.
      lastSeenAt: a.float().required(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // Presenter queue, imported by the admin from a CSV.
  Presenter: a
    .model({
      name: a.string().required(),
      projectName: a.string(),
      // Optional third CSV column; shown on the admin page only.
      extra: a.string(),
      position: a.integer().required(),
      // Epoch ms of when this presenter was put on stage; null = not yet.
      presentedAt: a.float(),
    })
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      // Long enough to cover setup + the event itself; the stack should be
      // deleted after the event anyway.
      expiresInDays: 30,
    },
  },
});
