// Phase 1 benchmark — k6 (open source, MPL-2.0) load test.
// Runs INSIDE the kind cluster against the generic demo service only.
// Never point this at any real / production URL.
//
// Ramp: 0 -> 200 -> 500 -> 1,000 concurrent virtual users, then down.
// Pass thresholds (the migration gate): <1% failed requests and
// p95 latency < 500 ms under load.
import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET = __ENV.DEMO_URL || 'http://demo.demo.svc.cluster.local/';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const res = http.get(TARGET);
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
