const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// HTTP 서버 - 정적 파일 제공
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
    res.end(data);
  });
});

// WebSocket 서버
const wss = new WebSocket.Server({ server });

const clients = new Map(); // ws -> nickname

wss.on('connection', (ws) => {
  console.log('새 클라이언트 연결');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const nickname = msg.nickname.trim().slice(0, 20);
      clients.set(ws, nickname);
      console.log(`입장: ${nickname}`);

      // 입장 알림 브로드캐스트
      broadcast({
        type: 'system',
        text: `${nickname}님이 입장했습니다.`,
        users: getUserList(),
      });

    } else if (msg.type === 'chat') {
      const nickname = clients.get(ws);
      if (!nickname) return;

      const text = msg.text.trim().slice(0, 500);
      if (!text) return;

      console.log(`[${nickname}]: ${text}`);

      // 메시지 브로드캐스트
      broadcast({
        type: 'chat',
        nickname,
        text,
        time: new Date().toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
  });

  ws.on('close', () => {
    const nickname = clients.get(ws);
    clients.delete(ws);
    if (nickname) {
      console.log(`퇴장: ${nickname}`);
      broadcast({
        type: 'system',
        text: `${nickname}님이 퇴장했습니다.`,
        users: getUserList(),
      });
    }
  });
});

function broadcast(data) {
  const json = JSON.stringify(data);
  for (const [client] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function getUserList() {
  return Array.from(clients.values());
}

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
