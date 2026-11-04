import { EventRoom } from './EventRoom';

export { EventRoom };

export interface Env {
  EVENT_ROOM: DurableObjectNamespace<EventRoom>;
  ASSETS: Fetcher;
  /** Admin page password. Set with `npx wrangler secret put ADMIN_PASSWORD`. */
  ADMIN_PASSWORD?: string;
}

/**
 * Static assets (the built React app in dist/) are served by Cloudflare
 * before this code runs. Only requests that match no asset reach here:
 * the WebSocket endpoint, routed to the single event room.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      // One event at a time → one Durable Object instance.
      const room = env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName('main'));
      return room.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
