# EmpHrx — Backend Architecture & Attendance Engine

> **Core Stack**: NestJS (v12) + Fastify + PostgreSQL + Prisma ORM + Redis + BullMQ + Swagger  
> **Production Architecture**: Multi-Method Capture Gateway, Repository Pattern, Redis Ephemeral Nonces, Transactional Outbox, BullMQ Asynchronous Calculation Workers, and Standardized Response Envelopes.

---

## 1. Architecture Overview

EmpHrx provides a unified attendance management platform designed for diverse organizational archetypes:
1. **Dynamic QR Code Display**: Ephemeral rotating QR codes on kiosk/tablet displays with 30s TTL, single-use cryptographic nonces in Redis, and anti-replay protection.
2. **Mobile GPS Geofencing**: Geofence boundary checks (Haversine distance) with GPS accuracy bounds verification to prevent spoofing.
3. **Overnight Shift Resolution**: Shifts crossing midnight (e.g. 22:00 to 06:00) resolve logically to the shift start business date rather than splitting across calendar dates.
4. **Attendance Regularizations**: Formal missed punch / correction requests with approval workflows and automatic BullMQ recalculation.
5. **Work From Home (WFH)**: Date range WFH requests with manager approvals and daily punch reconciliation.
6. **Configurable Settings & Holidays**: Organization-level working hours, half-day hours, grace periods, weekly off-days, and holiday calendars.
7. **Biometric Terminals**: (Phase 3) Hardware terminal HMAC push webhooks (eSSL, ZKTeco).

### Architectural Rules
* **Unified Ingestion Gateway (`AttendanceCaptureService`)**: All capture methods share unified validation, tenant scoping, Redis debounce locking, and idempotency guarantees.
* **Repository Pattern (`src/modules/attendance/repositories/`)**: All Prisma queries are encapsulated within dedicated repository classes.
* **Separation of Raw Ledger vs Rollup State**:
  * `attendance_punches`: Append-only, immutable physical event ledger.
  * `attendance_records`: Materialized daily summaries with snapshotted shift policies.
* **Transactional Outbox (`OutboxEvent`)**: Punch writes and outbox events commit atomically in a single `$transaction`. BullMQ workers process rollups asynchronously.
* **Development Identity Abstraction (`@CurrentActor()` / `RequestActor`)**:
  * Attendance endpoints resolve caller context through a decoupled `@CurrentActor()` decorator reading `x-org-id` and `x-actor-id` (or `x-employee-id`).
  * Enforces strict validation without fallbacks (`default-org-id`), enabling seamless drop-in transition to future AuthGuard/sessions without rewriting controllers or services.
* **Standard Response Envelope**: Responses conform to `{ success: true, statusCode, message, data, meta }` and errors to `{ success: false, statusCode, error, message, timestamp, path }`.

---

## 2. Directory Structure

```
emphrx-backend/
├── CODING_STANDARDS.md                  /* Engineering standards, response envelopes, commenting rules */
├── prisma/
│   └── schema.prisma                    /* PostgreSQL schema with 14 production models */
├── src/
│   ├── main.ts                          /* Fastify bootstrap, Swagger OpenAPI, global filter & interceptor */
│   ├── phase1-verify.ts                 /* Phase 1 integration verification script */
│   ├── phase2-verify.ts                 /* Phase 2 integration verification script */
│   ├── phase3-verify.ts                 /* Phase 3 integration verification script */
│   ├── phase4-verify.ts                 /* Phase 4 integration verification script */
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts /* Global error catching & standard error envelope */
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts /* Standard success response wrapper */
│   │   └── redis/
│   │       ├── redis.module.ts          /* Global Redis module */
│   │       └── redis.service.ts         /* ioredis client, atomic debounce lock, Lua nonce script */
│   ├── database/
│   │   ├── prisma.module.ts             /* Global Prisma module */
│   │   └── prisma.service.ts            /* PrismaClient lifecycle management */
│   └── modules/
│       └── attendance/
│           ├── attendance.module.ts     /* Wires controllers, services, repositories, and workers */
│           ├── controllers/
│           │   ├── qr-attendance.controller.ts       /* Dynamic QR session, check-in, check-out */
│           │   ├── geo-attendance.controller.ts      /* Mobile GPS check-in, check-out */
│           │   ├── attendance.controller.ts          /* Manual punch, query list, daily view */
│           │   ├── regularization.controller.ts      /* Correction requests & manager approvals */
│           │   ├── wfh.controller.ts                 /* WFH requests & manager approvals */
│           │   ├── attendance-setting.controller.ts  /* Organization attendance settings & rules */
│           │   ├── attendance-device.controller.ts   /* Hardware terminals & batch punch push */
│           │   └── attendance-analytics.controller.ts/* Analytics overview, CSV export, audit logs */
│           ├── dto/
│           │   ├── qr-session.dto.ts
│           │   ├── qr-punch.dto.ts
│           │   ├── geo-punch.dto.ts
│           │   ├── manual-punch.dto.ts
│           │   ├── regularization.dto.ts
│           │   ├── wfh.dto.ts
│           │   ├── attendance-setting.dto.ts
│           │   ├── attendance-query.dto.ts
│           │   ├── device.dto.ts                     /* Hardware terminal registration & batch DTOs */
│           │   └── analytics-export.dto.ts           /* Analytics overview & timesheet export DTOs */
│           ├── enums/
│           │   └── attendance.enums.ts
│           ├── guards/
│           │   └── device-hmac.guard.ts              /* Cryptographic HMAC-SHA256 signature guard */
│           ├── repositories/
│           │   ├── attendance-punch.repository.ts
│           │   ├── attendance-record.repository.ts
│           │   ├── attendance-location.repository.ts
│           │   ├── attendance-regularization.repository.ts
│           │   ├── attendance-wfh.repository.ts
│           │   ├── attendance-setting.repository.ts
│           │   ├── attendance-device.repository.ts   /* Hardware terminal and enrollment mappings */
│           │   └── audit-log.repository.ts           /* Immutable compliance audit trail queries */
│           ├── services/
│           │   ├── attendance-capture.service.ts     /* UNIFIED INGESTION (QR, Geo, Bio, Manual) */
│           │   ├── attendance-calculation.service.ts /* DAILY ROLLUP, OVERTIME & SHIFT SNAPSHOTS */
│           │   ├── attendance.service.ts             /* Multi-filter query and employee daily view */
│           │   ├── regularization.service.ts         /* Correction workflow & audit logging */
│           │   ├── wfh.service.ts                    /* WFH workflow & punch reconciliation */
│           │   ├── attendance-setting.service.ts     /* Org rules, off days, and grace limits */
│           │   ├── attendance-device.service.ts      /* Physical terminal lifecycle & heartbeat */
│           │   ├── attendance-webhook.service.ts     /* Outbound webhooks & signature dispatch */
│           │   ├── tier-entitlement.service.ts       /* Redis entitlement cache & plan feature gating */
│           │   ├── attendance-analytics.service.ts   /* Aggregated attendance metrics & trends */
│           │   ├── attendance-export.service.ts      /* Streaming timesheet CSV generation */
│           │   ├── qr/
│           │   │   └── qr-session.service.ts         /* Dynamic QR tokens & Redis nonces */
│           │   └── geolocation/
│           │       └── geofence.service.ts           /* Haversine distance & accuracy checks */
│           ├── utils/
│           │   └── hmac.util.ts                      /* HMAC signature calculation & verification */
│           └── workers/
│               └── attendance-queue.worker.ts        /* BullMQ worker & Outbox relay */
```

---

## 3. API Surface & Swagger OpenAPI

Interactive Swagger documentation is available locally at:  
👉 **`http://localhost:4000/api/docs`**

### Active Endpoints

#### Dynamic QR Attendance (`/api/attendance/qr`)
* `POST /api/attendance/qr/session`: Kiosk displays request rotating QR token (30s TTL in Redis).
* `POST /api/attendance/qr/check-in`: Mobile scans QR to clock in with atomic single-use nonce consumption.
* `POST /api/attendance/qr/check-out`: Mobile scans QR to clock out.

#### Geolocation & Geofencing (`/api/attendance/geo`)
* `POST /api/attendance/geo/check-in`: Mobile GPS check-in with Haversine distance geofence validation.
* `POST /api/attendance/geo/check-out`: Mobile GPS check-out.

#### Attendance Management & Queries (`/api/attendance`)
* `POST /api/attendance/manual`: Administrative manual punch exception (writes to `audit_logs`).
* `GET /api/attendance`: Paginated query with date range, employee, and status filters.
* `GET /api/attendance/:employeeId/:date`: Single employee day summary with punch timeline and snapshotted shift info.

#### Regularization Requests (`/api/attendance/regularizations`)
* `POST /api/attendance/regularizations`: Employee submits punch correction request.
* `PATCH /api/attendance/regularizations/:id/approve`: Manager/HR approval (triggers BullMQ recalculation).
* `PATCH /api/attendance/regularizations/:id/reject`: Manager/HR rejection.
* `GET /api/attendance/regularizations/employee/:employeeId`: Historical requests for employee.

#### Work From Home (`/api/attendance/wfh`)
* `POST /api/attendance/wfh`: Employee submits WFH date range request.
* `PATCH /api/attendance/wfh/:id/approve`: Approval updates matching daily records to `WORK_FROM_HOME`.
* `PATCH /api/attendance/wfh/:id/reject`: Rejection.
* `GET /api/attendance/wfh/employee/:employeeId`: Historical WFH requests.

#### Organization Settings (`/api/attendance/settings`)
* `GET /api/attendance/settings`: Fetch working hours, half-day hours, grace periods, weekly off days.
* `PUT /api/attendance/settings`: Update settings with audit logging.

#### Biometric Hardware Terminals & Webhooks (`/api/attendance/devices`)
* `POST /api/attendance/devices`: Register new hardware terminal (generates raw API key and stores SHA-256 hash).
* `GET /api/attendance/devices`: List all registered terminals for tenant organization.
* `GET /api/attendance/devices/:id`: Retrieve single device metadata and operational status.
* `PATCH /api/attendance/devices/:id`: Update terminal parameters (ONLINE, OFFLINE, MAINTENANCE, IP).
* `DELETE /api/attendance/devices/:id`: Decommission physical terminal.
* `POST /api/attendance/devices/:id/mappings`: Map employee UUID to biometric enrollment ID on terminal.
* `GET /api/attendance/devices/:id/mappings`: List all employee enrollment mappings for device.
* `DELETE /api/attendance/devices/:id/mappings/:mappingId`: Remove employee biometric mapping.
* `POST /api/attendance/devices/heartbeat`: Periodic terminal hardware ping updating status and heartbeat timestamp.
* `POST /api/attendance/devices/punch` (and `/api/attendance/device/punch`): High-throughput batch punch push endpoint authenticated via HMAC-SHA256 signature (`x-signature`, `x-timestamp`, `x-device-serial`) with duplicate deduplication and unmapped enrollment log isolation.

#### Analytics, Exports & Audit Trail (`/api/attendance`)
* `GET /api/attendance/analytics/overview`: High-level organizational attendance health, trends, and aggregate metrics.
* `GET /api/attendance/export`: Downloadable streaming CSV timesheet report.
* `GET /api/attendance/audit-logs`: Immutable compliance audit trail queries with filters.

---

## 4. Local Execution & Verification

### 1. Prerequisites
* **Node.js**: v22.x
* **PostgreSQL**: v15+ on port `5432` (`emphrx_db`)
* **Redis**: v7+ on port `6379`

### 2. Run End-to-End Tests
```bash
# Phase 1 Verification (QR, Anti-replay, Outbox, BullMQ, Shift Snapshots)
node dist/phase1-verify.js

# Phase 2 Verification (Geolocation, Geofence radius, Overnight Shifts, Regularization, WFH, Settings)
node dist/phase2-verify.js

# Phase 3 Verification (Biometric Terminals, HMAC Guard, Batch Ingestion, Overtime, Webhooks)
node dist/phase3-verify.js

# Phase 4 Verification (SaaS Quotas, Plan Feature Gating, Analytics, Streaming CSV, Audit Logs)
node dist/phase4-verify.js
```

### 3. Start Development Server
```bash
npm run start:dev
```
* Base URL: `http://localhost:4000/api`
* Swagger UI: `http://localhost:4000/api/docs`

