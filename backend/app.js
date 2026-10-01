import { createServer } from 'node:http';
import { ApiError } from './member-service.js';

export function createApp({ origins, checkDatabase, members }) {
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'Origin');
    const send = (status, data) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    };
    const origin = request.headers.origin;
    if (origin && !origins.includes(origin)) {
      return send(403, { error: 'Website origin is not allowed.' });
    }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/api/health' && request.method === 'GET') {
      try {
        await checkDatabase();
        return send(200, { database: 'connected', memberApi: members ? 'ready' : 'pending-schema-mapping' });
      } catch (_) {
        return send(503, { error: 'Database is unavailable. Check backend configuration.' });
      }
    }
    if (path === '/api/member-app') {
      if (!members) return send(503, { error: 'Member API setup is not complete. Database tables must be mapped first.' });
      try {
        const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
        let result;
        if (request.method === 'GET') {
          result = await members.get(new URL(request.url, 'http://localhost').searchParams.get('view'), token);
        } else if (request.method === 'POST') {
          const contentType = request.headers['content-type'] ?? '';
          if (!contentType.startsWith('multipart/form-data;')) throw new ApiError(415, 'Multipart form data is required.');
          const chunks = [];
          let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 11 * 1024 * 1024) throw new ApiError(413, 'Uploads are too large. Maximum 5 MB per image.');
            chunks.push(chunk);
          }
          let form;
          try {
            form = await new Request('http://localhost', { method: 'POST',
              headers: { 'content-type': contentType }, body: Buffer.concat(chunks) }).formData();
          } catch (_) { throw new ApiError(400, 'Invalid form data.'); }
          const keys = [...form.keys()];
          if (keys.length > 15 || new Set(keys).size !== keys.length) throw new ApiError(400, 'Invalid form fields.');
          result = await members.post(form, token, request.socket.remoteAddress);
        } else {
          return send(405, { error: 'Method not allowed.' });
        }
        if (result?.bytes) {
          response.setHeader('Content-Type', result.contentType);
          response.writeHead(200);
          return response.end(result.bytes);
        }
        return send(200, result);
      } catch (error) {
        if (!(error instanceof ApiError)) console.error('Member API operation failed:', error.code ?? 'internal');
        return send(error instanceof ApiError ? error.status : 500,
          { error: error instanceof ApiError ? error.message : 'Unable to complete the request. Please try again.' });
      }
    }
    send(404, { error: 'Not found.' });
  });
}
