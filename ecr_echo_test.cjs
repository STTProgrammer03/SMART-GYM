
const net = require('net');

const socket = net.createConnection({
  host: '192.168.2.193',
  port: 33898
});

socket.setTimeout(10000);

socket.on('connect', () => {
  console.log('Connected to ECR');

  const echo = Buffer.from(
    '02000C010B01C30000006A1003',
    'hex'
  );

  console.log('Sending:', echo.toString('hex').toUpperCase());
  socket.write(echo);
});

socket.on('data', (data) => {
  console.log('Received:', data.toString('hex').toUpperCase());
});

socket.on('end', () => {
  console.log('ECR ended the connection');
});

socket.on('close', (hadError) => {
  console.log('Connection closed; hadError =', hadError);
});

socket.on('timeout', () => {
  console.log('Timeout: no response within 10 seconds');
  socket.destroy();
});

socket.on('error', (error) => {
  console.log('Connection error:', error.message);
});
