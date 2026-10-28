
import assert from 'node:assert/strict';
import { parseTerminalResponse } from './nexgo-ecr.js';

function testResponseParser() {
  const cancelledResponse =
    '02000B010C01A1C7000AC0010006000000000100700303';

  const cancelled = parseTerminalResponse(cancelledResponse);

  assert.equal(cancelled.statusCode, 'C7');
  assert.equal(cancelled.message, 'Transaction cancelled.');
  assert.equal(cancelled.success, false);

  const invalid = parseTerminalResponse('NOT_HEX');

  assert.equal(invalid.statusCode, null);
  assert.equal(invalid.success, false);

  const badCrc = parseTerminalResponse(
    '02000B010C01C300003B5103'
  );

  assert.equal(badCrc.success, false);
  assert.equal(badCrc.statusCode, null);

  const incomplete = parseTerminalResponse('02000B01');

  assert.equal(incomplete.success, false);
  assert.equal(incomplete.statusCode, null);

  // Documented response example from the ECR PDF.
  const documentedResponse =
    parseTerminalResponse('02000B010C01C30000003B5003');

  console.log('Documented response result:', documentedResponse);

  assert.equal(documentedResponse.commandId, 'C3');
  assert.equal(documentedResponse.statusCode, '00');
  assert.equal(documentedResponse.success, false);
  assert.match(documentedResponse.message, /Successful status/);

  console.log('Parser tests passed.');
}

testResponseParser();
