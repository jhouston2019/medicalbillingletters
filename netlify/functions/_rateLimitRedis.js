/**
 * Distributed rate limit: Upstash Redis REST (if env set) else Supabase RPC rate_limit_consume.
 */

const { getSupabaseAdmin } = require("./_supabase");

const WINDOW_SEC = 60;
const DEFAULT_MAX = 5;

/**
 * @param {string} userId
 * @param {string} action
 * @param {number} [maxPerWindow]
 * @param {number} [windowSec]
 * @returns {Promise<{ ok: boolean, retryAfterSec?: number }>}
 */
async function checkRateLimitDistributed(userId, action, maxPerWindow = DEFAULT_MAX, windowSec = WINDOW_SEC) {
  if (!userId) return { ok: true };

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return upstashLimit(url.replace(/\/$/, ""), token, userId, action, maxPerWindow, windowSec);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("rate_limit_consume", {
    p_user_id: userId,
    p_action: action,
    p_max: maxPerWindow,
    p_window_sec: windowSec,
  });

  if (error) {
    console.error("[rate-limit] rate_limit_consume", error.message);
    return { ok: true };
  }

  const row = data;
  if (row && row.allowed === false) {
    return { ok: false, retryAfterSec: Number(row.retry_after_sec) || windowSec };
  }
  return { ok: true };
}

async function upstashLimit(baseUrl, token, userId, action, maxPerWindow, windowSec) {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rl:${action}:${userId}:${win}`;

  try {
    const res = await fetch(`${baseUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", key],
        ["TTL", key],
      ]),
    });
    if (!res.ok) {
      console.error("[rate-limit] Upstash HTTP", res.status);
      return { ok: true };
    }
    const body = await res.json();
    const parts = Array.isArray(body) ? body : [];
    const count = Number(parts[0]?.result ?? 0);
    const ttl = parts[1]?.result;

    if (count === 1 || ttl === -1) {
      await fetch(`${baseUrl}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([["EXPIRE", key, String(Math.max(windowSec * 2, 120))]]),
      });
    }

    if (count > maxPerWindow) {
      const retryAfterSec = windowSec - Math.floor((Date.now() / 1000) % windowSec);
      return { ok: false, retryAfterSec: retryAfterSec || windowSec };
    }
    return { ok: true };
  } catch (e) {
    console.error("[rate-limit] Upstash", e.message);
    return { ok: true };
  }
}

module.exports = { checkRateLimitDistributed, WINDOW_SEC, DEFAULT_MAX };
