const net = require('net');

const socket = new net.Socket();

socket.setTimeout(10000);

socket.connect(33898, '192.168.2.193', () => {
  console.log('Connected to ECR');

  // Send hexadecimal data as raw bytes
  const echo = Buffer.from(
    '02000C010B01C30000006A1003',
    'hex'
  );

  console.log('Sending:', echo.toString('hex').toUpperCase());
  socket.write(echo);
});

socket.on('data', (data) => {
  console.log('Received:', data.toString('hex').toUpperCase());
  socket.destroy();
});

socket.on('timeout', () => {
  console.log('Timeout: no response from ECR');
  socket.destroy();
});

socket.on('error', (error) => {
  console.log('Connection error:', error.message);
});

socket.on('close', () => {
  console.log('Connection closed');
});