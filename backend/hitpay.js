
import {
  createHmac,
  timingSafeEqual
} from 'node:crypto';

const HITPAY_TIMEOUT_MS = 30000;

export function createHitPayClient(config) {
  if (!config?.apiKey) {
    throw new Error('HitPay API Key is missing.');
  }

  if (!config?.baseUrl) {
    throw new Error('HitPay API URL is missing.');
  }

  async function request(path, options = {}) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      HITPAY_TIMEOUT_MS
    );

    try {
      const response = await fetch(
        `${config.baseUrl}${path}`,
        {
          ...options,
          headers: {
            'X-BUSINESS-API-KEY': config.apiKey,
            Accept: 'application/json',
            ...options.headers,
          },
          signal: controller.signal,
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.message ||
          result?.error ||
          `HitPay API request failed (HTTP ${response.status}).`
        );
      }

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('HitPay API request timed out.');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function createPaymentRequest(paymentData) {
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(paymentData)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          body.append(`${key}[]`, String(item));
        }
      } else {
        body.append(key, String(value));
      }
    }

    return request('/v1/payment-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    });
  }

  async function getPaymentRequest(paymentRequestId) {
    return request(
      `/v1/payment-requests/${encodeURIComponent(paymentRequestId)}`,
      {
        method: 'GET'
      }
    );
  }

  return {
    request,
    createPaymentRequest,
    getPaymentRequest,
    returnUrl: config.returnUrl,
    webhookUrl: config.webhookUrl,
  };
}

export function verifyHitPayWebhookSignature(
  rawBody,
  signature,
  webhookSalt
) {
  if (!rawBody || !signature || !webhookSalt) {
    return false;
  }

  const receivedSignature = String(signature)
    .trim()
    .replace(/^sha256=/i, '');

  if (!/^[a-f0-9]{64}$/i.test(receivedSignature)) {
    return false;
  }

  const expectedSignature = createHmac(
    'sha256',
    webhookSalt
  )
    .update(rawBody)
    .digest();

  const receivedBuffer = Buffer.from(
    receivedSignature,
    'hex'
  );

  return receivedBuffer.length === expectedSignature.length &&
    timingSafeEqual(receivedBuffer, expectedSignature);
}
