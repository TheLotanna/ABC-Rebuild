import type { FastifyRequest, FastifyReply } from 'fastify';

// PII guard intentionally NOT applied to this route.
//
// The only user-supplied field is `timezone`, which is an IANA label like
// `America/Edmonton` or `Europe/Zurich`. Two of the four words in the IANA
// catalogue would trigger the `name_candidate` low-confidence detector
// (`America`, `Europe`, `Antarctica`, etc. capitalised) — so gating this
// route would either generate constant audit noise or block every legit
// request when the low-confidence kind is upgraded to block-on-hit.
//
// The route returns only the server's current clock; it does not echo or
// process the body in any way that could exfiltrate PII downstream.
//
// If a future detector ever flags a known-clean IANA label, this comment
// should be updated and the route can opt back in.
export async function getTime(req: FastifyRequest, reply: FastifyReply) {
  const { timezone } = (req.body ?? {}) as { timezone?: string };
  const now = new Date();
  reply.send({
    time: {
      utc: now.toISOString(),
      timestamp: now.getTime(),
      date: now.toDateString(),
      time: now.toTimeString(),
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
    },
  });
}
