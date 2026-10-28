
import { testTerminalConnection } from './nexgo-ecr.js';

async function main() {
  const result = await testTerminalConnection();
  console.log('Echo result:', result);
}

main().catch((error) => {
  console.error('Echo test failed:', error.message);
});
