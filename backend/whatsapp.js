// Periskope accepts messages into a queue; acceptance is not a delivery receipt.
export function createOtpSender(env, fetchImpl = fetch) {
  return async (phone, otp) => {
    return sendWhatsAppMessage(env, phone,
      `Your U FITNESS GYM registration code is ${otp}. It expires in 5 minutes. Do not share this code with anyone. If you did not request it.`, fetchImpl);
  };
}

export async function sendWhatsAppMessage(env, phone, message, fetchImpl = fetch) {
  if (!/^[1-9]\d{6,14}$/.test(phone)) throw new Error('WhatsApp recipient requires a country code.');
  const apiKey = env.PERISKOPE_API_KEY?.trim();
  const sender = env.PERISKOPE_PHONE?.trim();
  const base = env.PERISKOPE_BASE_URL?.trim() || 'https://api.periskope.app/v1';
  if (!apiKey || !sender) throw new Error('WhatsApp delivery is not configured.');
  const url = new URL(`${base.replace(/\/+$/, '')}/message/send`);
  if (url.protocol !== 'https:') throw new Error('WhatsApp API requires HTTPS.');
  const response = await fetchImpl(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'x-phone': sender },
    body: JSON.stringify({ chat_id: `${phone}@c.us`, message }),
  });
  if (!response.ok) throw new Error('WhatsApp provider rejected the message.');
  const result = await response.json();
  if (!result?.queue_id) throw new Error('WhatsApp provider did not accept the message.');
  return result.queue_id;
}
