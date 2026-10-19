import cors from 'cors';
import express from 'express';
import request from 'supertest';

import {
  corsMiddlewareOptions,
  resetCorsResolvedCacheForTests,
  socketIoCorsOptions,
} from '../corsOrigins';

describe('explicit CORS allowlist', () => {
  const previous = { ...process.env };
  afterEach(() => {
    process.env = { ...previous };
    resetCorsResolvedCacheForTests();
  });
  it('uses only explicit local origins in development and tests', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.CORS_ORIGIN;
    expect(corsMiddlewareOptions().origin).not.toContain('*');
    expect(socketIoCorsOptions().origin).toContain('http://localhost:5173');
  });
  it.each([
    '*',
    'https://allowed.test,*',
    'null',
    'file:///tmp/x',
    'https://user:pass@host.test',
    'https://host.test/path',
  ])('rejects unsafe origin configuration %s', (origin) => {
    process.env.CORS_ORIGIN = origin;
    expect(() => corsMiddlewareOptions()).toThrow(/CORS_ORIGIN/);
  });
  it('requires an explicit deployment allowlist in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    expect(() => corsMiddlewareOptions()).toThrow(/required/);
  });
  it('allows configured origins but never reflects an arbitrary origin', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://manager.test,https://other.test';
    const app = express();
    app.use(cors(corsMiddlewareOptions()));
    app.get('/', (_req, res) => res.json({ ok: true }));
    const allowed = await request(app).get('/').set('Origin', 'https://manager.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://manager.test');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const refused = await request(app).get('/').set('Origin', 'https://attacker.test');
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
    expect(socketIoCorsOptions().origin).toEqual(['https://manager.test', 'https://other.test']);
  });
});
