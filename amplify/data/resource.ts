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
