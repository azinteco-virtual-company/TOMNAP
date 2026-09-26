import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { avoidTakenLoopbackPort, loopbackPortTaken } from '../helpers/loopbackPort';

const servers: net.Server[] = [];
const serve = (name: string) => {
  const server = http.createServer((_req, res) => res.end(name));
  servers.push(server);
  return server;
};
const listening = (server: net.Server) =>
  new Promise<void>((resolve, reject) => {
    if (server.listening) return resolve();
    server.once('listening', resolve).once('error', reject);
  });
const portOf = (server: net.Server) => (server.address() as net.AddressInfo).port;
const body = (port: number) =>
  new Promise<string>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        let text = '';
        res.setEncoding('utf8').on('data', (chunk: string) => (text += chunk));
        res.on('end', () => resolve(text));
      })
      .on('error', reject);
  });

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve())))
  );
});

describe('test servers never share a port that another process holds on 127.0.0.1', () => {
  it.runIf(process.platform === 'darwin')(
    'moves a wildcard server off a port a 127.0.0.1-only socket holds (macOS)',
    async () => {
      const thief = serve('thief').listen(0, '127.0.0.1');
      await listening(thief);
      const taken = portOf(thief);
      expect(loopbackPortTaken(taken)).toBe(true);

      // macOS lets the wildcard bind succeed; 127.0.0.1:<taken> would still reach the thief.
      const own = serve('own');
      own.listen(taken);
      expect(portOf(own)).toBe(taken);
      expect(await body(taken)).toBe('thief');

      avoidTakenLoopbackPort(own);
      await listening(own);
      expect(portOf(own)).not.toBe(taken);
      expect(loopbackPortTaken(portOf(own))).toBe(false);
      expect(await body(portOf(own))).toBe('own');
    }
  );

  it.runIf(process.platform !== 'darwin')(
    'relies on the OS refusing the overlapping wildcard bind (Linux)',
    async () => {
      const thief = serve('thief').listen(0, '127.0.0.1');
      await listening(thief);
      const own = serve('own');
      own.listen(portOf(thief));
      await expect(listening(own)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    }
  );

  it('leaves a server alone whose port is free on 127.0.0.1', async () => {
    const own = serve('own').listen(0);
    await listening(own);
    const port = portOf(own);
    avoidTakenLoopbackPort(own);
    expect(portOf(own)).toBe(port);
    expect(await body(port)).toBe('own');
  });
});
