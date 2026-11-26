# Podinino

> **Self-Hosted AI Coding Sandbox Platform** powered by Kubernetes, Claude Code Agent, and VS Code `code-server`.

[![CI & Docker Build](https://github.com/podinino/podinino/actions/workflows/ci.yml/badge.svg)](https://github.com/podinino/podinino/actions)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## ✨ Features

- **One-Click AI Workspaces**: Spin up containerized VS Code web IDEs on Kubernetes in seconds.
- **Claude Code First-Class Citizen**: Interactive chat, agent memory, and autonomous coding tools running inside isolated sandbox pods.
- **Pure MongoDB Persistence**: One single database stores users, workspace metadata, prompt turn history, and custom agent skills.
- **Single-Container Control Plane**: React UI and Python FastAPI backend compiled into **one single pod**.
- **Quota Enforced**: Multi-user quota tracking so clusters don't get overloaded.

---

## 🚀 Quick Start (Local with Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/podinino/podinino.git
cd podinino

# 2. Configure environment variables
cp deploy/.env.example deploy/.env
# Edit deploy/.env to provide your GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET

# 3. Start Podinino (Server + MongoDB)
docker compose -f deploy/docker-compose.yml up -d
```

Open your browser at **`http://localhost:8000`**.

---

## ☸️ Kubernetes Deployment (Helm)

Podinino ships with a production-ready Helm chart:

```bash
# 1. Add repo & namespace
kubectl create namespace podinino

# 2. Deploy using Helm
helm install podinino ./charts/podinino \
  --namespace podinino \
  --set ingress.host="podinino.yourdomain.com" \
  --set secret.githubClientId="your_id" \
  --set secret.githubClientSecret="your_secret" \
  --set secret.encryptionKey="symmetric-32-byte-key" \
  --set secret.mongodbUrl="mongodb://your-mongo:27017/podinino_db"
```

---

## 📁 Repository Structure

```
podinino/
├── server/          # Unified FastAPI backend (Auth, GitHub, Workspaces, Chat, Skills)
├── frontend/        # React 19 + Vite web dashboard
├── sandbox/         # In-pod code-server & Claude Code Agent container
├── charts/          # Production Helm chart (Single chart deployment)
├── deploy/          # Docker Compose & .env.example
└── .github/         # CI/CD pipelines (GHCR images)
```

---

## 📄 License

Apache 2.0 © 2026 Podinino Contributors
