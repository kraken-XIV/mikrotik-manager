import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import net, { AddressInfo } from 'net';
import { tmpdir } from 'os';
import path from 'path';
import tls from 'tls';

import { RouterOSClient } from '../RouterOSClient';

const challenge = '0123456789abcdef0123456789abcdef';
const password = 'test-pass';
const encode = (...words: string[]) =>
  Buffer.concat([
    ...words.map((word) => {
      const data = Buffer.from(word);
      if (data.length >= 128) throw new Error('fixture only encodes short words');
      return Buffer.concat([Buffer.from([data.length]), data]);
    }),
    Buffer.from([0]),
  ]);

function receive(socket: net.Socket, onSentence: (words: string[]) => void) {
  let pending = Buffer.alloc(0);
  socket.on('error', () => {});
  socket.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const words: string[] = [];
      let cursor = 0;
      let complete = false;
      while (cursor < pending.length) {
        const size = pending[cursor++];
        if (size === 0) {
          complete = true;
          break;
        }
        if (size >= 128 || cursor + size > pending.length) break;
        words.push(pending.subarray(cursor, cursor + size).toString());
        cursor += size;
      }
      if (!complete) return;
      pending = pending.subarray(cursor);
      onSentence(words);
    }
  });
}

type Mode = 'done' | 're' | 'modern' | 'modern-done' | 'malformed' | 'denied' | 'conflicting';
let key: Buffer;
let cert: Buffer;
beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtm-legacy-tls-'));
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
        '/CN=compat-test',
        '-keyout',
        path.join(dir, 'key'),
        '-out',
        path.join(dir, 'cert'),
      ],
      { stdio: 'ignore' },
    );
    key = readFileSync(path.join(dir, 'key'));
    cert = readFileSync(path.join(dir, 'cert'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
afterEach(() => {
  RouterOSClient.tlsVerifier = null;
});

async function fixture(mode: Mode, secure = true) {
  const received: string[][] = [];
  const sockets = new Set<net.Socket>();
  const connected = (socket: net.Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    receive(socket, (words) => {
      received.push(words);
      if (received.length === 1) {
        if (mode === 'modern-done') socket.write(encode('!done'));
        else if (mode === 'modern')
          socket.write(
            Buffer.concat([encode('!trap', '=message=missing credentials'), encode('!done')]),
          );
        else if (mode === 're')
          socket.write(Buffer.concat([encode('!re', `=ret=${challenge}`), encode('!done')]));
        else if (mode === 'conflicting')
          socket.write(
            Buffer.concat([
              encode('!re', `=ret=${challenge}`),
              encode('!done', `=ret=${'aa'.repeat(16)}`),
            ]),
          );
        else socket.write(encode('!done', `=ret=${mode === 'malformed' ? 'not-hex' : challenge}`));
      } else if (mode === 'denied')
        socket.write(
          Buffer.concat([encode('!trap', '=message=invalid credentials'), encode('!done')]),
        );
      else socket.write(encode('!done'));
    });
  };
  const server = secure ? tls.createServer({ key, cert }, connected) : net.createServer(connected);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const client = new RouterOSClient('127.0.0.1', port, 'admin', password, 3000, 3000, secure);
  RouterOSClient.tlsVerifier = async () => {};
  const close = async () => {
    client.disconnect();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return { client, received, close };
}

describe('legacy RouterOS protocol compatibility over verified TLS', () => {
  it.each(['done', 're'] as const)(
    'accepts challenge in !%s and never sends a clear password',
    async (mode) => {
      const f = await fixture(mode);
      try {
        await f.client.connect();
        const expected =
          '00' +
          createHash('md5')
            .update(Buffer.from([0]))
            .update(password)
            .update(Buffer.from(challenge, 'hex'))
            .digest('hex');
        expect(f.received).toEqual([
          ['/login'],
          ['/login', '=name=admin', `=response=${expected}`],
        ]);
        expect(f.received.flat().join(' ')).not.toContain(password);
        expect(f.client.isConnected()).toBe(true);
      } finally {
        await f.close();
      }
    },
  );
  it.each(['modern', 'modern-done'] as const)(
    'completes the %s probe before supplied-identity login',
    async (mode) => {
      const f = await fixture(mode);
      try {
        await f.client.connect();
        expect(f.received).toEqual([
          ['/login'],
          ['/login', '=name=admin', `=password=${password}`],
        ]);
        expect(f.client.isConnected()).toBe(true);
      } finally {
        await f.close();
      }
    },
  );
  it.each(['done', 're'] as const)(
    'refuses plaintext legacy !%s without sending any credentials',
    async (mode) => {
      const f = await fixture(mode, false);
      try {
        await expect(f.client.connect()).rejects.toThrow(/identity-verified API-SSL/);
        expect(f.received).toEqual([['/login']]);
      } finally {
        await f.close();
      }
    },
  );
  it.each(['malformed', 'conflicting'] as const)('refuses %s challenges', async (mode) => {
    const f = await fixture(mode);
    try {
      await expect(f.client.connect()).rejects.toThrow(/Malformed|Conflicting/);
      expect(f.received).toEqual([['/login']]);
    } finally {
      await f.close();
    }
  });
  it('never accepts a rejected legacy response as a successful session', async () => {
    const f = await fixture('denied');
    try {
      await expect(f.client.connect()).rejects.toThrow(/invalid credentials/);
      expect(f.client.isConnected()).toBe(false);
    } finally {
      await f.close();
    }
  });
  it('refuses an untrusted TLS peer before even the protocol probe', async () => {
    const f = await fixture('done');
    RouterOSClient.tlsVerifier = async () => {
      throw new Error('pin mismatch');
    };
    try {
      await expect(f.client.connect()).rejects.toThrow(/pin mismatch/);
      expect(f.received).toEqual([]);
    } finally {
      await f.close();
    }
  });
});
