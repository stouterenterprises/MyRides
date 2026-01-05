import { createServiceClient } from './supabase.ts';

let configCache: Record<string, any> = {};
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getConfig(key: string): Promise<any> {
  await ensureConfigLoaded();
  return configCache[key];
}

export async function getAllConfig(): Promise<Record<string, any>> {
  await ensureConfigLoaded();
  return configCache;
}

async function ensureConfigLoaded() {
  const now = Date.now();
  if (now - cacheTimestamp > CACHE_TTL) {
    const supabase = createServiceClient();
    const { data } = await supabase.from('config').select('key, value');

    if (data) {
      configCache = {};
      data.forEach((item: any) => {
        configCache[item.key] = parseConfigValue(item.value);
      });
      cacheTimestamp = now;
    }
  }
}

function parseConfigValue(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function getConfigValue<T = any>(config: Record<string, any>, key: string, defaultValue: T): T {
  return config[key] !== undefined ? config[key] : defaultValue;
}
