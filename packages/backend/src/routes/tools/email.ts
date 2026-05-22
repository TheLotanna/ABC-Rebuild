import type { FastifyRequest, FastifyReply } from 'fastify';

export async function sendEmail(req: FastifyRequest, reply: FastifyReply) {
  const { to, subject, body: emailBody, useHtml } = req.body as { to: string; subject: string; body: string; useHtml?: boolean };

  if (!to) return reply.code(400).send({ error: 'to is required' });
  if (!subject) return reply.code(400).send({ error: 'subject is required' });
  if (!emailBody) return reply.code(400).send({ error: 'body is required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) return reply.code(400).send({ error: 'Invalid email format' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return reply.code(500).send({ error: 'RESEND_API_KEY not configured' });

  try {
    const payload: Record<string, unknown> = {
      from: 'Agent Builder Console <info@agentbuilderconsole.com>',
      to: [to],
      subject,
    };
    if (useHtml) payload.html = emailBody;
    else payload.text = emailBody;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json() as { id?: string; error?: { message?: string } };
    if (!res.ok || data.error) throw new Error(data.error?.message ?? `Resend error ${res.status}`);

    reply.send({ success: true, id: data.id, message: `Email sent to ${to}` });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
