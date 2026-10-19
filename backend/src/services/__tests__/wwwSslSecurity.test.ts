jest.mock('../../config/database');
jest.mock('../mikrotik/DeviceCollector');
jest.mock('../apiSsl');

import { execFileSync } from 'child_process';
import { X509Certificate } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import https from 'https';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import path from 'path';

import { httpsAnswers } from '../wwwSsl';

describe('WebFig certificate identity', () => {
  let server: https.Server;
  let port: number;
  let fingerprint: string;
  beforeAll(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mtm-www-pin-'));
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-nodes',
          '-newkey',
          'rsa:2048',
          '-days',
          '1',
          '-subj',
          '/CN=mtm-test',
          '-keyout',
          path.join(dir, 'key.pem'),
          '-out',
          path.join(dir, 'cert.pem'),
        ],
        { stdio: 'ignore' },
      );
      const cert = readFileSync(path.join(dir, 'cert.pem'));
      const key = readFileSync(path.join(dir, 'key.pem'));
      fingerprint = new X509Certificate(cert).fingerprint256;
      server = https.createServer({ key, cert }, (_req, res) => res.end('ok'));
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      port = (server.address() as AddressInfo).port;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  it('accepts the authenticated device certificate despite its being self-signed', async () => {
    expect(await httpsAnswers('127.0.0.1', port, fingerprint)).toBeNull();
  });
  it('refuses a different certificate and a missing pin', async () => {
    expect(await httpsAnswers('127.0.0.1', port, '00'.repeat(32))).toMatch(/does not match/);
    expect(await httpsAnswers('127.0.0.1', port, '')).toMatch(/No valid/);
  });
});
