import assert from 'node:assert/strict';

function crc16(hex) {
  let crc = 0;

  for (const byte of Buffer.from(hex, 'hex')) {
    crc ^= byte;

    for (let i = 0; i < 8; i++) {
      crc = (crc & 1)
        ? (crc >> 1) ^ 0xA001
        : crc >> 1;
    }
  }

  return crc.toString(16).padStart(4, '0').toUpperCase();
}

function validateEcrMessage(rawResponse, expectedCommand) {
  const response = String(rawResponse)
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!/^[0-9A-F]+$/.test(response) || response.length % 2 !== 0) {
    throw new Error('Invalid hexadecimal response.');
  }

  const bytes = Buffer.from(response, 'hex');

  if (
    bytes.length < 13 ||
    bytes[0] !== 0x02 ||
    bytes[bytes.length - 1] !== 0x03
  ) {
    throw new Error('Invalid or incomplete ECR message.');
  }

  const dataLength = bytes.readUInt16BE(8);

  if (bytes.length !== 13 + dataLength) {
    throw new Error('Message length mismatch.');
  }

  const crcInput = bytes.subarray(1, bytes.length - 3).toString('hex');
  const receivedCrc = bytes
    .subarray(bytes.length - 3, bytes.length - 1)
    .toString('hex')
    .toUpperCase();

  if (receivedCrc !== crc16(crcInput)) {
    throw new Error('CRC validation failed.');
  }

  const commandId = bytes[6].toString(16).padStart(2, '0').toUpperCase();

  if (commandId !== expectedCommand) {
    throw new Error('Unexpected command ID.');
  }

  return {
    commandId,
    statusCode: bytes[7].toString(16).padStart(2, '0').toUpperCase(),
    payload: bytes.subarray(10, 10 + dataLength)
  };
}

function parseTlv(hex) {
  const bytes = Buffer.from(hex, 'hex');
  const fields = {};
  let offset = 0;

  while (offset < bytes.length) {
    assert.ok(offset + 4 <= bytes.length, 'Incomplete TLV header');

    const tag = bytes.subarray(offset, offset + 2).toString('hex').toUpperCase();
    const length = bytes.readUInt16BE(offset + 2);
    offset += 4;

    assert.ok(offset + length <= bytes.length, 'Invalid TLV length');

    fields[tag] = bytes.subarray(offset, offset + length);
    offset += length;
  }

  return fields;
}


function classifyCheckStatus(outerStatus, fields) {
  // The Check Status request itself was unsuccessful.
  // Section 5.11 says to repeat E3.
  if (outerStatus !== '00') {
    return 'retry';
  }

  const originalCodeField = fields.C01B;

  // Missing original response code: cannot determine the Sale outcome.
  if (!originalCodeField) {
    return 'retry';
  }

  const originalCode = originalCodeField.toString('ascii');

  if (originalCode === '00') {
    return 'confirmed';
  }

  if (originalCode === 'EA') {
    return 'pending';
  }

  // Check Status succeeded, and the original Sale returned
  // a code other than 00 or EA.
  return 'declined';
}


// Documented sample: C01B = ASCII "EA"; C01C = "Transaction Pending".
const sampleFields = parseTlv(
  'C0010006000000001000' +
  'C01B00024541' +
  'C01C00135472616E73616374696F6E2050656E64696E67'
);

assert.equal(sampleFields.C01B.toString('ascii'), 'EA');
assert.equal(sampleFields.C01C.toString('ascii'), 'Transaction Pending');
assert.equal(classifyCheckStatus('00', sampleFields), 'pending');
assert.equal(classifyCheckStatus('00', { C01B: Buffer.from('00') }), 'confirmed');
assert.equal(classifyCheckStatus('EA', sampleFields), 'retry');
assert.equal(classifyCheckStatus('00', {}), 'retry');

assert.throws(() => parseTlv('C01B0002FF'), /Invalid TLV length/);

console.log('All offline E3 TLV parsing tests passed.');

const sampleAck = '02000B010C01E3000000FB5B03';

const ack = validateEcrMessage(sampleAck, 'E3');

assert.equal(ack.commandId, 'E3');
assert.equal(ack.statusCode, '00');
assert.equal(ack.payload.length, 0);

assert.throws(
  () => validateEcrMessage(sampleAck, 'A1'),
  /Unexpected command ID/
);

assert.throws(
  () => validateEcrMessage(sampleAck.slice(0, -2), 'E3')
);

console.log('All offline ECR framing and CRC tests passed.');


/*
 * Offline test: complete synthetic E3 response.
 * No terminal connection or payment is involved.
 */
const pendingMessage = Buffer.from('Transaction Pending', 'ascii');

const responsePayload =
  'C0010006000000001000' +
  'C01B00024541' +
  'C01C' +
  pendingMessage.length.toString(16).padStart(4, '0').toUpperCase() +
  pendingMessage.toString('hex').toUpperCase();

const responseLength = Buffer.from(responsePayload, 'hex')
  .length
  .toString(16)
  .padStart(4, '0')
  .toUpperCase();

const responseData =
  '00' + '0B01' + '0C01' + 'E3' + '00' +
  responseLength + responsePayload;

const completePendingResponse =
  '02' + responseData + crc16(responseData) + '03';

const validated = validateEcrMessage(completePendingResponse, 'E3');
const responseFields = parseTlv(validated.payload.toString('hex'));

assert.equal(validated.statusCode, '00');
assert.equal(responseFields.C01B.toString('ascii'), 'EA');
assert.equal(
  responseFields.C01C.toString('ascii'),
  'Transaction Pending'
);
assert.equal(
  classifyCheckStatus(validated.statusCode, responseFields),
  'pending'
);

console.log('Full E3 pending-response test passed.');


function buildCheckStatusMessage(amountCents, invoice) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('Amount must be a positive integer in cents.');
  }

  if (!/^[A-Za-z0-9-]{1,16}$/.test(invoice)) {
  throw new Error('Invoice must contain 1–16 ASCII letters, digits, or hyphens.');
}

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
    .length
    .toString(16)
    .padStart(4, '0')
    .toUpperCase();

  const data =
    '00' + '0C01' + '0B01' + 'E3' + '10' + length + payload;

  return '02' + data + crc16(data) + '03';
}

const checkStatusMessage = buildCheckStatusMessage(10, 'UAT000000001');

assert.equal(checkStatusMessage.slice(0, 14), '02000C010B01E3');
assert.equal(checkStatusMessage.slice(-2), '03');

const decodedRequest = validateEcrMessage(checkStatusMessage, 'E3');
const requestFields = parseTlv(decodedRequest.payload.toString('hex'));

assert.equal(decodedRequest.statusCode, '10');
assert.equal(requestFields.C001.toString('hex').toUpperCase(), '000000000010');
assert.equal(requestFields.C013.toString('ascii'), 'UAT000000001');

console.log('Offline E3 request-builder tests passed.');

const pdfExample = buildCheckStatusMessage(
  1000,
  'ECR-202502060946'
);

console.log('Generated E3 request:', pdfExample);


async function checkStatusWithRetry(
  getResponse,
  maxAttempts = 3
) {
  let lastResult = 'retry';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await getResponse();

    const result = classifyCheckStatus(
      response.statusCode,
      response.fields
    );

    if (result === 'confirmed' || result === 'declined') {
      return result;
    }

    lastResult = result;
  }

  // Do not report success or decline when the outcome is unresolved.
  if (lastResult === 'pending') {
    return 'pending';
  }

  return 'reconcile';
}


let attempts = 0;

const retryTestResult = await checkStatusWithRetry(async () => {
  attempts++;

  return {
    statusCode: '00',
    fields: { C01B: Buffer.from('EA') }
  };
});

assert.equal(retryTestResult, 'pending');
assert.equal(attempts, 3);

console.log('Bounded E3 retry test passed.');

let failedCheckAttempts = 0;

const failedCheckResult = await checkStatusWithRetry(async () => {
  failedCheckAttempts++;

  return {
    statusCode: 'C0',
    fields: {}
  };
});

assert.equal(failedCheckResult, 'reconcile');
assert.equal(failedCheckAttempts, 3);

console.log('Repeated E3 check-failure test passed.');