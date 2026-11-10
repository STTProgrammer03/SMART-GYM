import { createServer } from 'node:http';
import { ApiError } from './member-service.js';
import { verifyHitPayWebhookSignature } from './hitpay.js';

export function createApp({
  origins,
  webhookSalt,
  checkDatabase,
  members,
  testTerminalConnection,
  sendSaleToTerminal,
  nexgoUatEnabled,
  nexgoMaxTestAmountCents
}) {
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
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Workspace');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }
    const path = new URL(request.url, 'http://localhost').pathname;
        if (path === '/api/nexgo/sale-test' && request.method === 'POST') {
                const isLocalRequest =
        request.socket.remoteAddress === '127.0.0.1' ||
        request.socket.remoteAddress === '::1' ||
        request.socket.remoteAddress === '::ffff:127.0.0.1';

      if (!isLocalRequest) {
        return send(403, {
          success: false,
          message: 'UAT Sale testing is allowed only from this PC.'
        });
      }
      const uatEnabled = nexgoUatEnabled === true;
const maxAmountCents = nexgoMaxTestAmountCents;

      if (!uatEnabled || !Number.isInteger(maxAmountCents) || maxAmountCents !== 10) {
        return send(403, {
          success: false,
          message: 'NEXGO UAT test endpoint is disabled or misconfigured.'
        });
      }

      try {
        const chunks = [];
        let size = 0;

        for await (const chunk of request) {
          size += chunk.length;

          if (size > 2048) {
            return send(413, {
              success: false,
              message: 'Request is too large.'
            });
          }

          chunks.push(chunk);
        }

        let body;

        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, {
            success: false,
            message: 'Invalid JSON request.'
          });
        }

        if (body.amountCents !== 10) {
          return send(400, {
            success: false,
            message: 'UAT test amount must be exactly RM0.10.'
          });
        }

        const invoice = `U${Date.now().toString().slice(-11)}`;

        const result = await sendSaleToTerminal(10, invoice);

        return send(200, {
          success: result.paymentConfirmed === true,
          message: result.paymentConfirmed === true
            ? 'Terminal reported an approved Sale response. Verify transaction details before further use.'
            : 'Payment is not confirmed. Check the terminal response.',
          invoice,
          terminal: result.parsed
        });
      } catch (error) {
        console.error('NEXGO UAT Sale failed:', error.code ?? error.message);

        return send(502, {
          success: false,
          message: 'Unable to complete the NEXGO UAT Sale request.'
        });
      }
    }
    if (path === '/api/nexgo/echo' && request.method === 'POST') {
  try {
    const result = await testTerminalConnection();
    return send(result.success ? 200 : 502, result);
  } catch (error) {
    console.error(
      'NEXGO Echo test failed:',
      error.code ?? error.message
    );

    return send(502, {
      success: false,
      message: 'Unable to communicate with NEXGO terminal.',
      details: error.code ?? 'request_failed'
    });
  }
}
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
        const workspace = request.headers['x-workspace'];
        const scopedMembers = typeof members === 'function' ? members(workspace || undefined) : members;
        const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
        let result;
        if (request.method === 'GET') {
          const requestUrl = new URL(request.url, 'http://localhost');
          const view = requestUrl.searchParams.get('view');
          const viewToken = view === 'workspace-for-phone' ? requestUrl.searchParams.toString() : token;
          result = await scopedMembers.get(view, viewToken);
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
          result = await scopedMembers.post(form, token, request.socket.remoteAddress);
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
        if (!(error instanceof ApiError)) console.error('Member API operation failed:', error);
        return send(error instanceof ApiError ? error.status : 500,
          { error: error instanceof ApiError ? error.message : 'Unable to complete the request. Please try again.' });
      }
    }
    send(404, { error: 'Not found.' });
  });
}
