// server-bridge.js
import http from 'http';

let currentData = {
  transcript: '',
  whisperText: '',
  detailedAnswer: '',
  isLoading: false,
  timestamp: 0
};

const server = http.createServer((req, res) => {
  // CORS Headers taaki Chrome aur Electron dono data bhej aur padh sakein
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/sync') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        currentData = { ...currentData, ...parsed, timestamp: Date.now() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400);
        res.end();
      }
    });
  } else if (req.method === 'GET' && req.url === '/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentData));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(4000, () => {
  console.log('Bridge Live on http://localhost:4000/sync');
});