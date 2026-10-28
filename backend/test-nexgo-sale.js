
import { sendSaleToTerminal } from './nexgo-ecr.js';

async function main() {
  const amountCents = 10; // RM0.10 UAT test
  const invoice = 'INV260408001';

  console.log('Sending UAT card Sale request...');
  console.log('Amount: RM0.10');
  console.log('Invoice:', invoice);

  const result = await sendSaleToTerminal(amountCents, invoice);

  console.log('HTTP status:', result.httpStatus);
  console.log('Sale request:', result.request);
  console.log('Raw terminal response:', result.response);
  console.log('Parsed response:', result.parsed);
  console.log('Payment confirmed:', result.paymentConfirmed);
}

main().catch((error) => {
  console.error('UAT Sale test failed:', error.message);
});
