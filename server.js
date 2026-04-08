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
const REQUIRED_WORDS = ['오드리'];
const HISTORY_FILE = '/tmp/mychat-history.json';

// 히스토리 파일 로드
function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// 히스토리 파일 저장
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf8');
}

let chatHistory = loadHistory();

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
      const codeWords = Array.isArray(msg.codeWords) ? msg.codeWords : [];
      const isValid = REQUIRED_WORDS.every(w => codeWords.includes(w));

      if (!isValid) {
        ws.send(JSON.stringify({ type: 'error', text: '입장 코드가 올바르지 않습니다.' }));
        ws.close();
        return;
      }

      clients.set(ws, nickname);
      console.log(`입장: ${nickname}`);

      // 기존 대화 내역 전송
      if (chatHistory.length > 0) {
        ws.send(JSON.stringify({ type: 'history', messages: chatHistory }));
      }

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

      const chatMsg = {
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
      };

      chatHistory.push(chatMsg);
      saveHistory(chatHistory);

      broadcast(chatMsg);

    } else if (msg.type === 'clear') {
      const nickname = clients.get(ws);
      if (!nickname) return;

      chatHistory = [];
      saveHistory(chatHistory);
      console.log(`대화 삭제: ${nickname}`);

      broadcast({ type: 'clear' });
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
