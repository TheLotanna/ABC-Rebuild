import type { FastifyRequest, FastifyReply } from 'fastify';

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

export async function getWeather(req: FastifyRequest, reply: FastifyReply) {
  const { location, units = 'metric' } = req.body as { location: string; units?: string };
  if (!location) return reply.code(400).send({ error: 'location is required' });

  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error('Failed to geocode location');
    const geoData = await geoRes.json() as { results?: Array<{ latitude: number; longitude: number; name: string; country: string; admin1?: string }> };
    if (!geoData.results?.length) throw new Error(`Location not found: ${location}`);

    const { latitude, longitude, name, country, admin1 } = geoData.results[0];
    const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = units === 'imperial' ? 'mph' : 'kmh';

    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`,
    );
    if (!wRes.ok) throw new Error('Failed to fetch weather data');
    const wd = await wRes.json() as { current: Record<string, unknown>; daily: Record<string, unknown[]>; current_units: Record<string, string> };

    const c = wd.current;
    const d = wd.daily;
    const u = wd.current_units;

    reply.send({
      location: { name, country, admin1, latitude, longitude },
      current: {
        temperature: c.temperature_2m,
        feels_like: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        weather_code: c.weather_code,
        description: WMO_CODES[c.weather_code as number] ?? 'Unknown',
        cloud_cover: c.cloud_cover,
        wind_speed: c.wind_speed_10m,
        wind_direction: c.wind_direction_10m,
        is_day: c.is_day,
        units: { temperature: u.temperature_2m, wind: u.wind_speed_10m },
      },
      forecast: (d.time as string[]).slice(0, 7).map((date: string, i: number) => ({
        date,
        max: (d.temperature_2m_max as number[])[i],
        min: (d.temperature_2m_min as number[])[i],
        description: WMO_CODES[(d.weather_code as number[])[i]] ?? 'Unknown',
        precipitation: (d.precipitation_sum as number[])[i],
        precipitation_probability: (d.precipitation_probability_max as number[])[i],
      })),
    });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
