
import { sendSaleToTerminal } from './nexgo-ecr.js';

const amountCents = 100; // RM1.00
const invoice = `UAT${Date.now().toString().slice(-9)}`;

console.log('Sending Sale request to NEXGO N86...');
console.log('Amount: RM1.00');
console.log('Invoice:', invoice);

try {
  const result = await sendSaleToTerminal(amountCents, invoice);

  console.log('HTTP status:', result.httpStatus);
  console.log('Terminal result:', {
    commandId: result.parsed.commandId,
    statusCode: result.parsed.statusCode,
    message: result.parsed.message,
    paymentConfirmed: result.paymentConfirmed
  });
} catch (error) {
  console.error('Sale request failed:', error.message);
}
