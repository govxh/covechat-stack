// Heavy gate test — k6 (MPL-2.0). A workload DELIBERATELY heavier than
// CoveChat's real usage on every axis, run ONLY inside the throwaway
// kind cluster against the synthetic heavy-chat service. Never point
// this at any real / production URL.
//
// Why heavier (real-use figures are estimates, labelled as such):
//   CoveChat estimate: 1,000 users -> ~30-100 msgs/sec, ~0.2-0.5 KB each,
//     small-group fan-out, rare attachments.
//   This test: 1,000 WS users, 1 msg / 2s each with a 2 KB payload
//     (= 500 msgs/sec), fan-out to ~20 room members per message,
//     a DB write + history read per message, plus ~30 uploads/sec of
//     200 KB attachments into MinIO. Roughly 10-50x the real load.
// Pass thresholds: WS error rate < 1%, p95 end-to-end message latency
// < 500 ms, upload failures < 1%.
import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const WS_URL = __ENV.HEAVY_WS || 'ws://heavy-chat.heavy.svc.cluster.local:8080/chat';
const HTTP_URL = __ENV.HEAVY_HTTP || 'http://heavy-chat.heavy.svc.cluster.local:8080';

const wsLatency = new Trend('ws_msg_latency');
const wsOutcome = new Rate('ws_msg_outcome'); // 0 = message delivered, 1 = socket error
const uploads = new Counter('heavy_uploads');

export const options = {
  scenarios: {
    ws_users: {
      executor: 'ramping-vus',
      exec: 'wsUser',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    uploads: {
      executor: 'constant-vus',
      exec: 'uploader',
      vus: 100,
      duration: '5m',
    },
  },
  thresholds: {
    ws_msg_latency: ['p(95)<500'],
    ws_msg_outcome: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const BIG_TEXT = 'x'.repeat(2048);
const BIG_FILE = 'y'.repeat(200 * 1024);

export function wsUser() {
  const room = __VU % 50;
  ws.connect(`${WS_URL}?room=${room}`, null, function (socket) {
    socket.on('open', function () {
      socket.setInterval(function () {
        socket.send(JSON.stringify({ text: BIG_TEXT, ts: Date.now() }));
      }, 2000);
      socket.setTimeout(function () {
        socket.close();
      }, 120000);
    });
    socket.on('message', function (data) {
      try {
        const msg = JSON.parse(data);
        wsLatency.add(Date.now() - msg.ts);
        wsOutcome.add(0);
      } catch (e) {
        // ignore malformed frames
      }
    });
    socket.on('error', function () {
      wsOutcome.add(1);
    });
  });
  sleep(1);
}

export function uploader() {
  const res = http.post(`${HTTP_URL}/upload`, BIG_FILE, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  check(res, { 'upload status 200': (r) => r.status === 200 });
  if (res.status === 200) {
    uploads.add(1);
  }
  sleep(3);
}
