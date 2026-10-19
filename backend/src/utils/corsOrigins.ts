import type { CorsOptions } from 'cors';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
];

let allowedCache: string[] | null = null;
function allowedOrigins(): string[] {
  if (allowedCache) return allowedCache;
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN is required in production');
  }
  const origins = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_DEV_ORIGINS;
  if (!origins.length) throw new Error('CORS_ORIGIN must contain an HTTP(S) origin');
  for (const origin of origins) {
    if (origin.includes('*')) throw new Error('CORS_ORIGIN does not allow wildcards');
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGIN must contain explicit HTTP(S) origins, not wildcards');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    ) {
      throw new Error(
        'CORS_ORIGIN must contain explicit HTTP(S) origins without credentials or paths',
      );
    }
  }
  allowedCache = [...origins];
  return allowedCache;
}

export function resetCorsResolvedCacheForTests(): void {
  allowedCache = null;
}

/** Explicit deployment allowlist; never reflect arbitrary browser origins. */
export function corsMiddlewareOptions(): CorsOptions {
  return { origin: allowedOrigins(), credentials: true };
}
export function socketIoCorsOptions(): {
  origin: string[];
  methods: string[];
  credentials: boolean;
} {
  return { origin: allowedOrigins(), methods: ['GET', 'POST'], credentials: true };
}
