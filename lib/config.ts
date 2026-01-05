import { createClient } from './supabase/server';

// =====================================================
// Config Cache & Helpers
// =====================================================

let configCache: Record<string, any> = {};
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getConfig(key: string): Promise<any> {
  const now = Date.now();

  if (now - cacheTimestamp > CACHE_TTL) {
    await refreshConfigCache();
  }

  return configCache[key];
}

export async function getAllConfig(): Promise<Record<string, any>> {
  const now = Date.now();

  if (now - cacheTimestamp > CACHE_TTL) {
    await refreshConfigCache();
  }

  return configCache;
}

async function refreshConfigCache() {
  const supabase = await createClient();
  const { data } = await supabase.from('config').select('key, value');

  if (data) {
    configCache = {};
    data.forEach((item) => {
      configCache[item.key] = item.value;
    });
    cacheTimestamp = Date.now();
  }
}

// Client-side config getter (for Edge Functions)
export function getConfigValue<T = any>(config: Record<string, any>, key: string, defaultValue: T): T {
  if (config[key] === undefined) {
    return defaultValue;
  }

  // Parse JSON values if needed
  if (typeof config[key] === 'string') {
    try {
      return JSON.parse(config[key]);
    } catch {
      return config[key];
    }
  }

  return config[key];
}
