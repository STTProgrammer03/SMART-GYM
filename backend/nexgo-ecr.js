import axios from 'axios';

const TERMINAL_URL =
  process.env.NEXGO_TERMINAL_URL || 'http://192.168.2.193:33898/';

function crc16(hex) {
  let crc = 0;

  for (const byte of Buffer.from(hex, 'hex')) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
    }
  }

  return crc.toString(16).padStart(4, '0').toUpperCase();
}


export async function testE3Diagnostic() {
  const amountCents = 100;
const invoice = 'UAT553754250';

  const amount = String(amountCents).padStart(12, '0');
  const invoiceHex = Buffer.from(invoice, 'ascii')
    .toString('hex')
    .toUpperCase();
  const invoiceLength = Buffer.from(invoice, 'ascii')
    .length
    .toString(16)
    .padStart(4, '0')
    .toUpperCase();

  const payload =
    'C0010006' + amount +
    'C013' + invoiceLength + invoiceHex;

  const length = Buffer.from(payload, 'hex')
    .length.toString(16).padStart(4, '0').toUpperCase();

  const data = '00' + '0C01' + '0B01' + 'E3' + '10' + length + payload;
  const message = '02' + data + crc16(data) + '03';

  console.log('[E3 DIAGNOSTIC] Request:', message);
  console.log('[E3 DIAGNOSTIC] Sending request to:', TERMINAL_URL);

  const response = await axios.post(TERMINAL_URL, message, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: 15000,
    responseType: 'text'
  });

  console.log('[E3 DIAGNOSTIC] HTTP status:', response.status);
  console.log('[E3 DIAGNOSTIC] Raw HTTP response:', JSON.stringify(response.data));

  return {
    httpStatus: response.status,
    request: message,
    rawResponse: String(response.data)
  };
}



export function parseTerminalResponse(rawResponse) {
  const response = String(rawResponse)
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  const invalid = (message) => ({
    success: false,
    statusCode: null,
    message,
    rawResponse: response
  });

  if (!/^[0-9A-F]+$/.test(response)) {
    return invalid('Invalid response: not hexadecimal.');
  }

  const bytes = Buffer.from(response, 'hex');

  if (
    bytes.length < 13 ||
    bytes[0] !== 0x02 ||
    bytes[bytes.length - 1] !== 0x03
  ) {
    return invalid('Invalid or incomplete terminal response.');
  }


  // The message-data length occupies bytes 8 and 9.
  
const dataLength = bytes.readUInt16BE(8);
const expectedLength = 13 + dataLength;

  if (bytes.length !== expectedLength) {
    return invalid('Response message length does not match.');
  }

  // CRC covers the bytes after STX and before the CRC and ETX.
  const crcInput = bytes.subarray(1, bytes.length - 3).toString('hex');
  const receivedCrc = bytes
    .subarray(bytes.length - 3, bytes.length - 1)
    .toString('hex')
    .toUpperCase();

  const expectedCrc = crc16(crcInput);

  if (receivedCrc !== expectedCrc) {
    return invalid('Response CRC validation failed.');
  }

  const commandId = bytes[6].toString(16).padStart(2, '0').toUpperCase();
  const statusCode = bytes[7].toString(16).padStart(2, '0').toUpperCase();

  const statusMessages = {
  '00': 'Terminal reported a successful status. Verify the transaction result before activating membership.',
  'C0': 'Terminal transaction timeout. Payment outcome requires verification.',
  'C4': 'EMV-related error. Payment not confirmed.',
  'C7': 'Transaction cancelled. Payment not confirmed.',
  'CA': 'Communication error. Payment outcome requires verification.',
  'EA': 'Transaction pending. Check Status is required where specified by the NDPS ECR documentation.'
};

  return {
  success: statusCode === '00',
  commandId,
  statusCode,
  message: statusMessages[statusCode] ||
    'Unverified or unsuccessful status.',
  rawResponse: response
};
}


export function parseSaleResponse(rawResponse, expectedAmountCents) {
  const parsed = parseTerminalResponse(rawResponse);

  if (!parsed.success) {
    return {
      ...parsed,
      paymentConfirmed: false
    };
  }

  if (parsed.commandId !== 'A1') {
    return {
      ...parsed,
      paymentConfirmed: false,
      message: 'Unexpected terminal response command.'
    };
  }

  const response = String(rawResponse)
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  const bytes = Buffer.from(response, 'hex');
  const dataLength = bytes.readUInt16BE(8);
  const data = bytes.subarray(10, 10 + dataLength);

  // Read the response's Tag-Length-Value (TLV) fields.
  const fields = {};
  let offset = 0;

  while (offset < data.length) {
    if (offset + 2 > data.length) {
      return {
        ...parsed,
        paymentConfirmed: false,
        message: 'Malformed Sale response TLV.'
      };
    }

    const tag = data
      .subarray(offset, offset + 2)
      .toString('hex')
      .toUpperCase();
    offset += 2;

    if (offset + 2 > data.length) {
      return {
        ...parsed,
        paymentConfirmed: false,
        message: 'Missing TLV length.'
      };
    }

    const length = data.readUInt16BE(offset);
    offset += 2;

    if (offset + length > data.length) {
      return {
        ...parsed,
        paymentConfirmed: false,
        message: 'Invalid TLV field length.'
      };
    }

    fields[tag] = data.subarray(offset, offset + length);
    offset += length;
  }

  // C001 is the transaction amount in the ECR specification.
  const amountField = fields.C001;

if (!amountField || amountField.length !== 6) {
  return {
    ...parsed,
    paymentConfirmed: false,
    message: 'Sale response is missing a valid transaction amount.'
  };
}

const amountText = amountField.toString('hex').toUpperCase();

if (!/^\d{12}$/.test(amountText)) {
  return {
    ...parsed,
    paymentConfirmed: false,
    message: 'Sale response has an invalid amount format.'
  };
}

const actualAmountCents = Number(amountText);

  if (
    !Number.isSafeInteger(actualAmountCents) ||
    actualAmountCents !== expectedAmountCents
  ) {
    return {
      ...parsed,
      paymentConfirmed: false,
      message: 'Returned transaction amount does not match the requested amount.'
    };
  }

  return {
    ...parsed,
    paymentConfirmed: true,
    amountCents: actualAmountCents,
    message: 'Terminal reported success and the transaction amount matches.'
  };
}




export function buildSaleMessage(amountCents, invoice) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('Payment amount must be a positive integer in cents.');
  }

  if (!/^[A-Za-z0-9]{1,12}$/.test(invoice)) {
    throw new Error('Invoice must contain 1–12 ASCII letters or digits.');
  }

  // Encode the amount as six bytes using the documented 12-digit format.
  const amount = String(amountCents).padStart(12, '0');

  const invoiceHex = Buffer.from(invoice, 'ascii')
    .toString('hex')
    .toUpperCase();

  // Build TLV fields with their correct lengths.
  const payload =
    'C0010006' +
    amount +
    'C013' +
    Buffer.from(invoice, 'ascii')
      .length
      .toString(16)
      .padStart(4, '0')
      .toUpperCase() +
    invoiceHex;

  const length = Buffer.from(payload, 'hex')
    .length
    .toString(16)
    .padStart(4, '0')
    .toUpperCase();

  const data =
    '00' + '0C01' + '0B01' + 'A1' + '00' + length + payload;

  return '02' + data + crc16(data) + '03';
}

export async function sendSaleToTerminal(amountCents, invoice) {
  const message = buildSaleMessage(amountCents, invoice);

  try {
    const response = await axios.post(TERMINAL_URL, message, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 120000,
      responseType: 'text'
    });

    const rawResponse = String(response.data).trim();

    console.log('[NEXGO DEBUG] HTTP status:', response.status);
    console.log('[NEXGO DEBUG] Raw response:', JSON.stringify(rawResponse));

    const parsed = parseSaleResponse(rawResponse, amountCents);

    return {
      httpStatus: response.status,
      request: message,
      response: rawResponse,
      parsed,
      paymentConfirmed: parsed.paymentConfirmed === true
    };
  } catch (error) {
    console.error('[NEXGO SALE ERROR]', {
      code: error.code ?? null,
      message: String(error.message ?? 'Unknown error').slice(0, 300),
      httpStatus: error.response?.status ?? null,
      timeoutMs: 120000
    });

    throw error;
  }
}


export async function testTerminalConnection() {
  const response = await axios.post(
    TERMINAL_URL,
    '02000C010B01C30000006A1003',
    {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 10000,
      responseType: 'text'
    }
  );



  const rawResponse = String(response.data).trim().toUpperCase();

  const expectedResponse = '02000B010C01C30000003B5003';

  return {
    success: response.status === 200 && rawResponse === expectedResponse,
    httpStatus: response.status,
    command: 'C3',
    response: rawResponse,
    message:
      response.status === 200 && rawResponse === expectedResponse
        ? 'NEXGO terminal communication successful.'
        : 'Terminal responded, but the Echo response did not match the expected response.'
  };
}
