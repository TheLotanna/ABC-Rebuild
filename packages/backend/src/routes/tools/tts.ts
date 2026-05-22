import type { FastifyRequest, FastifyReply } from 'fastify';

export async function elevenlabsTts(req: FastifyRequest, reply: FastifyReply) {
  const { text, voice_id, model_id = 'eleven_multilingual_v2' } = req.body as { text: string; voice_id?: string; model_id?: string };
  if (!text) return reply.code(400).send({ error: 'text is required' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return reply.code(500).send({ error: 'ELEVENLABS_API_KEY not configured' });

  const voiceId = voice_id ?? 'FyYFoP6qNryBV7G8rnI9';

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ text, model_id, output_format: 'mp3_44100_128', voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true } }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs error ${res.status}: ${errText}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    reply.send({ audioData: buf.toString('base64'), mimeType: 'audio/mpeg', model: model_id, voice: voiceId });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

export async function getElevenlabsVoices(_req: FastifyRequest, reply: FastifyReply) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return reply.code(500).send({ error: 'ELEVENLABS_API_KEY not configured' });

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
    if (!res.ok) throw new Error(`ElevenLabs error ${res.status}`);
    const data = await res.json();
    reply.send(data);
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
