const http = require('http');
const os = require('os');
const dns = require('dns');

const hostname = os.hostname();

dns.lookup(os.hostname(), (err, addr) => {
  const host_address = addr;

  const server = http.createServer((req, res) => {
    res.writeHeader(200, { 'Content-Type': 'text/plain' });
    const client = req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;
    const log = `${client}\t → \t ${hostname} @ [${host_address}]`;
    res.end(log);
    console.log(log);
  });

  server.on('clientError', (err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.listen(8000, () => {
    console.log(`Listening on ${host_address}:8000 ...`);
  });
});
