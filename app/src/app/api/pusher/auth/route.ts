import { bad, route } from "@/lib/server/graph";
import { pusherAuth } from "@/lib/server/push";

/** Realtime auth: {socket_id, channel_name} → Pusher signature, only for my own `private-user-<address>`. */
export function POST(req: Request) {
  return route(req, { off: true }, async (me, b) => {
    if (typeof b.socket_id !== "string" || !/^\d+\.\d+$/.test(b.socket_id) || typeof b.channel_name !== "string") return bad();
    return pusherAuth(me, b.socket_id, b.channel_name) ?? bad("forbidden", 403);
  });
}
