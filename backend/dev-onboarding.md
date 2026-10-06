# VibePay Developer Onboarding Guide

Welcome to VibePay 🎵⚡

VibePay enables instant music micro-tipping powered by Stellar blockchain.

---

# Tech Stack

Frontend:
- Next.js (App Router)
- TailwindCSS
- ShadCN UI

Backend:
- NestJS
- PostgreSQL
- Redis
- Stellar SDK

Infrastructure:
- Docker
- WebSockets
- S3 Storage

---

# Prerequisites

- Node.js v20+
- PNPM or Yarn
- Docker
- PostgreSQL
- Redis
- Stellar Testnet Account

---

# Monorepo Structure

apps/
  frontend/
  api/

packages/
  shared/
  ui/
  config/

docs/

---

# Setup Instructions

## 1. Clone Repository

git clone https://github.com/your-org/tiptune.git
cd tiptune

---

## 2. Install Dependencies

pnpm install

---

## 3. Configure Environment Variables

For a complete list of environment variables, descriptions, and defaults, see the [Canonical Environment Variable Reference](../docs/environment-reference.md).

Core variables to get started:
- `DB_*`: Database credentials
- `JWT_SECRET`: Secret for tokens
- `STELLAR_NETWORK`: `testnet`
- `STELLAR_TIP_ESCROW_CONTRACT`: Deployed contract ID

---

## 4. Start Infrastructure

docker-compose up -d

---

## 5. Start API

cd apps/api
pnpm run start:dev

---

## 6. Start Frontend

cd apps/frontend
pnpm run dev

---

# Development Workflow

1. Create feature branch
2. Follow conventional commit format
3. Add tests
4. Submit PR
5. CI must pass before merge

---

# Testing

Unit Tests:
pnpm run test

E2E Tests:
pnpm run test:e2e

---

# Real-Time Events Architecture

- Redis Pub/Sub for broadcasting tips
- WebSocket Gateway in NestJS
- Client listens for tip.received events
- Artist dashboard updates instantly

---

# Stellar Integration Flow

1. Fan selects tip amount
2. Backend generates payment payload
3. Frontend signs transaction
4. Transaction submitted to Stellar
5. Webhook confirms transaction
6. Tip recorded in DB
7. WebSocket emits tip.received event

---

# Coding Standards

- Strict TypeScript
- DTO validation required
- No business logic in controllers
- Service layer handles blockchain
- Transactions must be idempotent

---

# Adding a New Module

1. Create module folder in src/
2. Add module.ts
3. Add controller.ts
4. Add service.ts
5. Add dto/
6. Register module in AppModule

---

# Contribution Guidelines

- Keep PRs small
- Add tests
- Update documentation
- Follow lint rules

---

# Vision

VibePay empowers artists to earn directly from fans through instant micro-payments — no intermediaries, no friction.

---

Welcome to the future of music tipping 🎶⚡