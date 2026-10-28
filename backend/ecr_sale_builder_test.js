
import assert from 'node:assert/strict';
import { buildSaleMessage } from './nexgo-ecr.js';

const message = buildSaleMessage(100, '202502281441');

console.log('Generated sale message:', message);
console.log('Message length in bytes:', Buffer.from(message, 'hex').length);
console.log('CRC generated:', message.slice(-6, -2));

assert.match(message, /^[0-9A-F]+$/);
assert.equal(message.slice(0, 14), '02000C010B01A1');
assert.equal(message.slice(-2), '03');

console.log('Local message structure test passed.');
