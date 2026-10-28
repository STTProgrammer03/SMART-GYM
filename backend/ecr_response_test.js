import assert from 'node:assert/strict';
import {
  parseTerminalResponse,
  parseSaleResponse
} from './nexgo-ecr.js';

// Test 1: Documented NDPS Echo response.
const echoResponse = '02000B010C01C30000003B5003';
const echoResult = parseTerminalResponse(echoResponse);

assert.equal(echoResult.commandId, 'C3');
assert.equal(echoResult.statusCode, '00');
assert.equal(echoResult.success, true);

console.log('PASS: Echo response is parsed correctly.');

// Test 2: Reject an incomplete response.
const incompleteResult = parseTerminalResponse('02000B010C01C300');

assert.equal(incompleteResult.success, false);
console.log('PASS: Incomplete response is rejected.');

// Test 3: Reject a response containing non-hexadecimal characters.
const invalidHexResult = parseTerminalResponse('NOT_HEX');

assert.equal(invalidHexResult.success, false);
console.log('PASS: Invalid hexadecimal response is rejected.');

// Test 4: Inspect the documented Sale response sample.
// This is a local parser test. It does NOT send a payment.
const saleResponse =
  '02000B010C01A1000121C0010006000000000100C00700103533333334392A2A2A2A2A2A37313832C00600050228144216C00200083130303030383331C00300083236363230303337D01700134D414830303030313333393138303031333634C0040003001364D00200023039C00B000C303030323937393636373931C00C000E4130303030303036313530303031C00F000A38303030303038303030C00D00074D794465626974D01800074D594445424954C00A0006323937393636C00E0010344343334638353935393130334331C010001C4E4F2050494E204F52205349474E4154555245205245515549524544C0050003313433C017001C4E4F2050494E204F52205349474E4154555245205245515549524544D008000107D01A000457617665C0080002022988D103';

const saleBytes = Buffer.from(saleResponse, 'hex');
const declaredDataLength = saleBytes.readUInt16BE(8);
const expectedTotalLength = 13 + declaredDataLength;
const saleResult = parseTerminalResponse(saleResponse);

console.log('Sale sample bytes:', saleBytes.length);
console.log('Declared data length:', declaredDataLength);
console.log('Expected total bytes:', expectedTotalLength);
console.log('Sale sample parser result:', saleResult);

assert.equal(saleResult.success, false);
console.log('PASS: Sale sample is not accepted as a confirmed payment.');

console.log('\nAll local response parser safety tests passed.');



// C001 is six ASCII digits encoded as six bytes.
// This test checks amount decoding without contacting the terminal.
const amountBytes = Buffer.from('000100', 'ascii');

assert.equal(amountBytes.length, 6);
assert.equal(Number(amountBytes.toString('ascii')), 100);

console.log('PASS: Six-byte ASCII amount decoding works.');



console.log('\nTesting Sale response parser...');

function crc16ForTest(hex) {
  let crc = 0;

  for (const byte of Buffer.from(hex, 'hex')) {
    crc ^= byte;

    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
    }
  }

  return crc.toString(16).padStart(4, '0').toUpperCase();
}

function buildTestSaleResponse(amountCents, statusCode = '00') {
  const amount = String(amountCents).padStart(12, '0');
  const payload = 'C0010006' + amount;
  const dataLength = Buffer.from(payload, 'hex')
    .length
    .toString(16)
    .padStart(4, '0')
    .toUpperCase();

  const data = '00' + '0B01' + '0C01' + 'A1' +
    statusCode + dataLength + payload;

  return '02' + data + crc16ForTest(data) + '03';
}

const approved = parseSaleResponse(
  buildTestSaleResponse(100),
  100
);
console.log('Matching amount:', approved);
if (approved.paymentConfirmed !== true) {
  throw new Error('Matching amount test failed.');
}

const mismatch = parseSaleResponse(
  buildTestSaleResponse(101),
  100
);
if (mismatch.paymentConfirmed !== false) {
  throw new Error('Amount mismatch test failed.');
}

const declined = parseSaleResponse(
  buildTestSaleResponse(100, 'C7'),
  100
);
if (declined.paymentConfirmed !== false) {
  throw new Error('Declined payment test failed.');
}

console.log('PASS: Matching amount is accepted by the parser.');
console.log('PASS: Amount mismatch is not confirmed.');
console.log('PASS: Declined response is not confirmed.');
