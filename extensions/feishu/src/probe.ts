import { createFeishuClient, type FeishuClientCredentials } from "./client.js";
import type { FeishuProbeResult } from "./types.js";

// In-memory cache for bot info probe results
// Reduces API calls from ~43,200/month to ~4,320/month (90% reduction)
// See: https://github.com/openclaw/openclaw/issues/26684
const botInfoCache = new Map<string, { data: FeishuProbeResult; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ERROR_CACHE_TTL_MS = 60 * 1000; // 1 minute for error results

export async function probeFeishu(creds?: FeishuClientCredentials): Promise<FeishuProbeResult> {
  if (!creds?.appId || !creds?.appSecret) {
    return {
      ok: false,
      error: "missing credentials (appId, appSecret)",
    };
  }

  // Check cache first - bot info is static and safe to cache
  const cacheKey = creds.appId;
  const cached = botInfoCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  try {
    const client = createFeishuClient(creds);
    // Use bot/v3/info API to get bot information
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generic request method
    const response = await (client as any).request({
      method: "GET",
      url: "/open-apis/bot/v3/info",
      data: {},
    });

    if (response.code !== 0) {
      const result: FeishuProbeResult = {
        ok: false,
        appId: creds.appId,
        error: `API error: ${response.msg || `code ${response.code}`}`,
      };
      // Cache error results briefly to avoid hammering on failure
      botInfoCache.set(cacheKey, { data: result, expiresAt: Date.now() + ERROR_CACHE_TTL_MS });
      return result;
    }

    const bot = response.bot || response.data?.bot;
    const result: FeishuProbeResult = {
      ok: true,
      appId: creds.appId,
      botName: bot?.bot_name,
      botOpenId: bot?.open_id,
    };

    // Cache successful results for 10 minutes
    botInfoCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result: FeishuProbeResult = {
      ok: false,
      appId: creds.appId,
      error: err instanceof Error ? err.message : String(err),
    };
    // Cache error results briefly to avoid hammering on failure
    botInfoCache.set(cacheKey, { data: result, expiresAt: Date.now() + ERROR_CACHE_TTL_MS });
    return result;
  }
}
