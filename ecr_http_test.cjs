
const http = require('http');

const body = Buffer.from(
  '02000C010B01C30000006A1003',
  'hex'
);

const req = http.request(
  {
    hostname: '192.168.2.193',
    port: 33898,
    path: '/',
    method: 'POST',
    agent: false,
    setHost: true,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': body.length
    },
    timeout: 10000
  },
  (res) => {
    console.log('HTTP status:', res.statusCode);

    res.on('data', (chunk) => {
      console.log('Response:', chunk.toString());
    });

    res.on('end', () => {
      console.log('HTTP response complete');
    });
  }
);

req.on('timeout', () => {
  console.log('Request timed out');
  req.destroy();
});

req.on('error', (err) => {
  console.log('Error:', err.message);
});

req.write(body);
req.end();
