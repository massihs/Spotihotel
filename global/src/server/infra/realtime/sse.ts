import { realtimeBus, type RealtimeEvent, type Unsubscribe } from "./index";

const HEARTBEAT_MS = 25_000;
const encoder = new TextEncoder();

/**
 * Server-Sent Events stream for the given topics.
 * - `retry` tells EventSource to reconnect after 3 s if the connection drops
 * - a comment heartbeat keeps proxies and load balancers from closing idle streams
 * - everything is released when the client disconnects
 */
export function sseResponse(req: Request, topicList: string[]): Response {
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const offs: Unsubscribe[] = [];
      const heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        offs.forEach((off) => off());
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);

      const onEvent = (e: RealtimeEvent) =>
        send(`event: ${e.type}\ndata: ${JSON.stringify(e.data ?? {})}\n\n`);
      for (const topic of topicList) offs.push(await realtimeBus().subscribe(topic, onEvent));
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable buffering on nginx
    },
  });
}
