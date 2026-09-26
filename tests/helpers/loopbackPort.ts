import net from 'node:net';

/**
 * macOS picks the port of a wildcard listen(0) without checking listeners that
 * other processes hold on 127.0.0.1 only; a connection to 127.0.0.1:<port> then
 * reaches that more specific socket instead of the test server. Seen with a
 * local IDE holding 127.0.0.1:52050 and :63019 and answering test requests with
 * its own 404. Linux refuses such overlapping binds, so only macOS is checked.
 */
interface ServerInternals {
  _handle: { close(): void } | null;
  _listen2(address: string | null, port: number, addressType: number): void;
}
const internals = (server: net.Server) => server as unknown as ServerInternals;

/** True when another socket already listens on 127.0.0.1:<port>. Synchronous. */
export function loopbackPortTaken(port: number): boolean {
  const probe = net.createServer();
  probe.on('error', () => {}); // the asynchronous EADDRINUSE of a taken port
  // Node binds synchronously here; on failure the handle stays null.
  internals(probe)._listen2('127.0.0.1', port, 4);
  const taken = internals(probe)._handle === null;
  if (!taken) probe.close();
  return taken;
}

/** Moves a wildcard-bound server off a port another process holds on 127.0.0.1. */
export function avoidTakenLoopbackPort(server: net.Server): void {
  if (process.platform !== 'darwin') return;
  for (let attempt = 0; attempt < 20; attempt++) {
    const address = server.address();
    if (!address || typeof address !== 'object') return;
    if (address.address !== '::' && address.address !== '0.0.0.0') return;
    if (!loopbackPortTaken(address.port)) return;
    // Rebind synchronously like a host-less listen(0): callers read the port right away.
    const own = internals(server);
    own._handle?.close();
    own._handle = null;
    own._listen2(null, 0, 4);
  }
}
