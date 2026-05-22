import type { FastifyRequest, FastifyReply } from 'fastify';

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
