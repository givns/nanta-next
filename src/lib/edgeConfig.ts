// lib/edgeConfig.ts
import { createClient } from '@vercel/edge-config';

export const edgeConfig = createClient(process.env.EDGE_CONFIG);

// Helper functions to access edge config values
export async function getFeatureFlag(
  key: string,
  defaultValue = false,
): Promise<boolean> {
  try {
    const value = await edgeConfig.get<boolean>(key);
    return value ?? defaultValue;
  } catch (err) {
    console.warn(`Error fetching feature flag ${key}:`, err);
    return defaultValue;
  }
}

export async function getAppSetting<T>(
  key: string,
  defaultValue: T,
): Promise<T> {
  try {
    const value = await edgeConfig.get<T>(key);
    return value ?? defaultValue;
  } catch (err) {
    console.warn(`Error fetching app setting ${key}:`, err);
    return defaultValue;
  }
}
