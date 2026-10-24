# covechat-stack

A forever-free, open-source Kubernetes stack — a proof-of-stack template
being prepared for CoveChat. This repository is **generic**: it contains no
production configuration, no real credentials, no live endpoints, and it is
not connected to any running service.

## What is in the stack

| Piece | Software | Licence / cost |
|---|---|---|
| Cluster (CI proof) | kind (Kubernetes in Docker) | Apache-2.0, free forever |
| Packaging | Helm | Apache-2.0, free forever |
| Object storage | MinIO **Community** edition | AGPLv3, free forever |
| Metrics | Prometheus | Apache-2.0, free forever |
| Dashboards | Grafana **OSS** | AGPLv3, free forever |
| Security scanning | Trivy | Apache-2.0, free forever |

No trials, no time-limited offers, no paid tiers — every component is the
self-hosted open-source edition, so nothing expires.

## Demo placeholders

`k8s/values-minio.yaml` uses `minioadmin / minioadmin` and
`k8s/values-monitoring.yaml` uses Grafana admin password `admin`.
These are **public demo placeholders for a throwaway local cluster only** —
they are not real secrets. Replace them (via a secrets manager, never by
committing real values) before any non-demo use.

## How to run it

### Option A — GitHub Actions (no local Docker needed)

1. Push this folder to a **public** GitHub repository.
2. Run the `stack` workflow (Actions tab → `stack` → *Run workflow*, or any
   push touching `k8s/**`).
3. The workflow creates a 3-node kind cluster, Helm-installs MinIO
   Community and kube-prometheus-stack (Prometheus + Grafana OSS), prints
   `kubectl get pods -A` / services as proof, then runs Trivy config and
   image scans and prints the results in the run log.

### Option B — local machine with Docker

```bash
kind create cluster --config k8s/kind-config.yaml
helm repo add minio https://charts.min.io/
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
kubectl create namespace storage
helm install minio minio/minio -n storage -f k8s/values-minio.yaml --wait
kubectl create namespace monitoring
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring -f k8s/values-monitoring.yaml --wait
kubectl get pods -A
```

## Benchmark (migration gate)

The workflow also runs a benchmark stage **inside the throwaway cluster**:

- `k8s/demo-service.yaml` deploys a generic demo service (tiny nginx,
  2 replicas + a CPU-based HPA up to 6 replicas) — not any real app.
- `k6/load.js` (run as the in-cluster Job in `k6/k6-job.yaml`, image
  `grafana/k6`, open source) ramps to **1,000 concurrent virtual users**
  over ~4 minutes against the demo service only.
- The run log records total requests, error rate, p50/p95/p99 latency,
  HPA behaviour and pod health. Gate targets: **< 1% errors** and
  **p95 < 500 ms** at 1,000 concurrent users.

Load is generated only against the demo service in the cluster — never
against any external or production system.

## Layout

- `.github/workflows/stack.yml` — the proof + benchmark pipeline
- `k8s/kind-config.yaml` — 3-node kind cluster (1 control-plane, 2 workers)
- `k8s/values-minio.yaml` — MinIO Community, standalone, small resources
- `k8s/values-monitoring.yaml` — Prometheus + Grafana OSS, small resources
- `k8s/demo-service.yaml` — generic benchmark demo service + HPA
- `k6/load.js`, `k6/k6-job.yaml` — the in-cluster load test

## Phase 2 (not in this repo, needs separate approval)

Migrating actual application services onto this stack, with real secrets
handled outside git and a proper rollout/rollback plan.
