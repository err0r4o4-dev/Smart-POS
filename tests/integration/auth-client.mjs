import http from 'node:http';
import net from 'node:net';

const origin = 'http://localhost:18088';
const upstream = process.env.AUTH_CLIENT_UPSTREAM;
if (!['caddy:8088', 'api:8080'].includes(upstream)) {
  throw new Error('Unsupported isolated test upstream');
}

const server = http.createServer((request, response) => {
  const target = new URL(request.url, origin);
  if (target.origin !== origin) {
    response.writeHead(403).end();
    return;
  }
  const forwarded = http.request(
    `http://${upstream}${target.pathname}${target.search}`,
    {
      method: request.method,
      headers: { ...request.headers, host: new URL(origin).host },
      timeout: 15000,
    },
    (result) => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    },
  );
  forwarded.on('timeout', () => forwarded.destroy());
  forwarded.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(forwarded);
});

server.on('connect', (request, socket, head) => {
  if (request.url !== new URL(origin).host) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  const [host, port] = upstream.split(':');
  const tunnel = net.connect(Number(port), host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) tunnel.write(head);
    socket.pipe(tunnel).pipe(socket);
  });
  tunnel.setTimeout(15000, () => tunnel.destroy());
  tunnel.on('error', () => socket.destroy());
  socket.on('error', () => tunnel.destroy());
  socket.on('close', () => tunnel.destroy());
});
server.listen(8081, '0.0.0.0');
