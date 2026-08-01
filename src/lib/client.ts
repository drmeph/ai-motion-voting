import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export type Session = Schema['Session']['type'];
export type Participant = Schema['Participant']['type'];

/** Fixed id of the single event session record. */
export const SESSION_ID = 'main';

let client: ReturnType<typeof generateClient<Schema>> | null = null;

/** Lazily created so it is only constructed after Amplify.configure() ran. */
export function getClient() {
  if (!client) {
    client = generateClient<Schema>();
  }
  return client;
}
