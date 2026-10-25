import { createServer } from 'node:http';

const statuses = { 'invalid-argument': 400, unauthenticated: 401, 'permission-denied': 403, 'failed-precondition': 400, unavailable: 503 };
export function createLocalServer({ verifyToken, handlers }) {
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => { if (!res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); } };
    const fail = (code, message) => send(statuses[code] ?? 500, { error: { status: code.toUpperCase().replaceAll('-', '_'), message } });
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (req.method === 'GET' && name === 'health') { send(200, { status: 'ok' }); return; }
    if (req.method !== 'POST' || !Object.hasOwn(handlers, name)) { send(404, { error: { status: 'NOT_FOUND', message: 'Unknown endpoint.' } }); return; }
    const bearer = req.headers.authorization?.match(/^Bearer ([^\s]{1,8192})$/)?.[1];
    if (!bearer) { fail('unauthenticated', 'Sign in to Firebase first.'); return; }
    let token;
    try { token = await verifyToken(bearer); }
    catch { fail('unauthenticated', 'Firebase sign-in could not be verified. Sign in again.'); return; }
    let body;
    try {
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) throw new Error('Too large'); chunks.push(chunk); }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || !Object.hasOwn(body, 'data')) throw new Error('Missing data');
    } catch { fail('invalid-argument', 'Send a valid callable request body.'); return; }
    try {
      const result = await handlers[name]({ auth: { uid: token.uid, token }, data: body.data });
      send(200, { result });
    } catch (error) {
      if (Object.hasOwn(statuses, error.code)) fail(error.code, error.message);
      else fail('internal', 'The local backend could not complete the request.');
    }
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 10000;
  return server;
}
