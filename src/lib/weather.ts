import { db } from "@/lib/db";

export type Geocoded = { latitude: number; longitude: number };

export type RoundWeather = {
  temp_high_f: number | null;
  temp_low_f: number | null;
  wind_max_mph: number | null;
  precip_in: number | null;
  weather_code: number | null;
};

const FETCH_TIMEOUT_MS = 8000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(
  url: string,
  headers?: Record<string, string>,
  retryOn429 = false,
): Promise<T> {
  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { signal: ctrl.signal, headers });
    } finally {
      clearTimeout(timer);
    }
  };
  let res = await attempt();
  if (res.status === 429 && retryOn429) {
    await sleep(5000);
    res = await attempt();
    if (res.status === 429) {
      await sleep(10000);
      res = await attempt();
    }
  }
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

type NominatimResult = { lat: string; lon: string };

const NOMINATIM_HEADERS = { "User-Agent": "golf-app/1.0 (private leaderboard)" };

export async function geocodeCourse(input: {
  name: string;
  address?: string | null;
  city: string | null;
  state?: string | null;
}): Promise<Geocoded | null> {
  const state = input.state ?? "MI";
  const country = "USA";

  if (input.address && input.city) {
    const params = new URLSearchParams({
      street: input.address,
      city: input.city,
      state,
      country,
      format: "json",
      limit: "1",
    });
    const data = await fetchJson<NominatimResult[]>(
      `https://nominatim.openstreetmap.org/search?${params}`,
      NOMINATIM_HEADERS,
      true,
    );
    if (data.length > 0) {
      return { latitude: Number(data[0].lat), longitude: Number(data[0].lon) };
    }
    await sleep(1100);
  }

  const q = [input.name, input.city, state, country].filter(Boolean).join(", ");
  const params = new URLSearchParams({ q, format: "json", limit: "1" });
  const data = await fetchJson<NominatimResult[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
    NOMINATIM_HEADERS,
    true,
  );
  if (data.length > 0) {
    return { latitude: Number(data[0].lat), longitude: Number(data[0].lon) };
  }
  return null;
}

type DailyResponse = {
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

function daysAgo(dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00Z`).getTime();
  return Math.floor((Date.now() - d) / 86_400_000);
}

const DAILY_PARAMS =
  "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code";
const UNITS =
  "temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America/Detroit";

export async function fetchRoundWeather(
  lat: number,
  lng: number,
  playedAt: string,
): Promise<RoundWeather | null> {
  const date = playedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const recent = daysAgo(date) < 5;
  const base = recent
    ? `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&past_days=7&forecast_days=1&daily=${DAILY_PARAMS}&${UNITS}`
    : `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&daily=${DAILY_PARAMS}&${UNITS}`;

  const data = await fetchJson<DailyResponse>(base);
  const d = data.daily;
  if (!d || !d.time) return null;
  const idx = d.time.indexOf(date);
  if (idx < 0) return null;

  return {
    temp_high_f: d.temperature_2m_max?.[idx] ?? null,
    temp_low_f: d.temperature_2m_min?.[idx] ?? null,
    wind_max_mph: d.wind_speed_10m_max?.[idx] ?? null,
    precip_in: d.precipitation_sum?.[idx] ?? null,
    weather_code: d.weather_code?.[idx] ?? null,
  };
}

type RoundCourseRow = {
  round_id: number;
  played_at: string;
  weather_fetched_at: string | null;
  course_id: number;
  course_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function populateRoundWeather(
  roundId: number,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  try {
    const row = await db
      .prepare(
        `SELECT r.id AS round_id, r.played_at, r.weather_fetched_at,
                c.id AS course_id, c.name AS course_name, c.address, c.city, c.state,
                c.latitude, c.longitude
         FROM rounds r JOIN courses c ON c.id = r.course_id
         WHERE r.id = ?`,
      )
      .get<RoundCourseRow>(roundId);
    if (!row) return false;
    if (row.weather_fetched_at && !opts.force) return true;

    let lat = row.latitude;
    let lng = row.longitude;
    if (lat == null || lng == null) {
      const geo = await geocodeCourse({
        name: row.course_name,
        address: row.address,
        city: row.city,
        state: row.state,
      });
      if (!geo) {
        console.warn(`[weather] geocode miss for course ${row.course_id} (${row.course_name})`);
        return false;
      }
      await db
        .prepare("UPDATE courses SET latitude = ?, longitude = ? WHERE id = ?")
        .run(geo.latitude, geo.longitude, row.course_id);
      lat = geo.latitude;
      lng = geo.longitude;
    }

    const w = await fetchRoundWeather(lat, lng, row.played_at);
    if (!w) {
      console.warn(`[weather] no data for round ${roundId} (${row.played_at})`);
      return false;
    }

    await db
      .prepare(
        `UPDATE rounds
         SET temp_high_f = ?, temp_low_f = ?, wind_max_mph = ?, precip_in = ?,
             weather_code = ?, weather_fetched_at = now()
         WHERE id = ?`,
      )
      .run(
        w.temp_high_f,
        w.temp_low_f,
        w.wind_max_mph,
        w.precip_in,
        w.weather_code,
        roundId,
      );
    return true;
  } catch (err) {
    console.error(`[weather] populateRoundWeather failed for round ${roundId}:`, err);
    return false;
  }
}

export { wmoLabel } from "./weather-labels";
