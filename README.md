# EmpHrx — Backend Architecture & Attendance Engine

> **Core Stack**: NestJS (v12) + Fastify + PostgreSQL + Prisma ORM + Redis + BullMQ + Swagger  
> **Production Architecture**: Unified Multi-Method Capture Pipeline, Redis-Backed Ephemeral QR Session Engine, Transactional Outbox Pattern, and BullMQ Asynchronous Calculation Workers.

---

## 1. Architecture Overview

EmpHrx provides a unified attendance management platform designed for diverse organizational archetypes:
1. **Office / Reception Displays**: Dynamic rotating QR codes generated on tablet/kiosk displays with 30-second TTL and single-use cryptographic nonces.
2. **Mobile GPS Geofencing**: Geofence boundary checks (Haversine distance) with mock-location mitigations for field, remote, and hybrid staff.
3. **Biometric Terminals**: HMAC-signed webhook log ingestion for hardware terminals (eSSL, ZKTeco).
4. **Administrative Overrides**: Manual punch adjustments, regularizations, and WFH tracking with immutable audit trails.

### Architectural Principles
* **Single Capture Gateway (`AttendanceCaptureService`)**: All punch methods share unified validation, tenant scoping, Redis debounce locking, and idempotency guarantees.
* **Separation of Raw Events vs. Rollup State**:
  * `attendance_punches`: Append-only, immutable physical event ledger.
  * `attendance_records`: Materialized daily summaries (`firstCheckIn`, `lastCheckOut`, `totalWorkMinutes`, `lateMinutes`, `status`).
* **Zero Synchronous Recalculation on Punch**: Ingestion persists the punch and inserts an `outbox_events` row inside a single ACID `$transaction` in < 50ms. A BullMQ worker (`attendance.calculate`) processes recalculations asynchronously.
* **Ephemeral Data in Redis**: Dynamic QR tokens and nonces live exclusively in Redis with 30s TTL, eliminating database write bloat.
* **Historical Shift Snapshots**: Shift parameters (`snapshotShiftCode`, `snapshotStartTime`, `snapshotEndTime`, `snapshotFullDayMins`, `snapshotGraceMins`) are snapshotted onto `attendance_records` so future policy changes never alter past attendance.

---

## 2. Directory Structure

```
emphrx-backend/
├── prisma/
│   └── schema.prisma                    /* Production PostgreSQL Prisma schema */
├── src/
│   ├── app.controller.ts
│   ├── app.module.ts                    /* Root module registering Config, Prisma, Redis, Attendance */
│   ├── app.service.ts
│   ├── main.ts                          /* Fastify bootstrap, global validation, Swagger OpenAPI */
│   ├── phase1-verify.ts                 /* Phase 1 end-to-end verification script */
│   ├── common/
│   │   └── redis/
│   │       ├── redis.module.ts          /* Global Redis module */
│   │       └── redis.service.ts         /* ioredis client, atomic debounce lock, Lua nonce script */
│   ├── database/
│   │   ├── prisma.module.ts             /* Global Prisma module */
│   │   └── prisma.service.ts            /* PrismaClient lifecycle management */
│   └── modules/
│       └── attendance/
│           ├── attendance.module.ts     /* Wires controllers, services, and queue worker */
│           ├── controllers/
│           │   ├── qr-attendance.controller.ts    /* Kiosk session, check-in, check-out */
│           │   └── attendance.controller.ts       /* Manual punch, paginated list, daily view */
│           ├── dto/
│           │   ├── qr-session.dto.ts              /* Kiosk session request/response */
│           │   ├── qr-punch.dto.ts                /* Mobile QR punch payload */
│           │   ├── manual-punch.dto.ts            /* Admin manual entry payload */
│           │   └── attendance-query.dto.ts        /* Filterable pagination query */
│           ├── enums/
│           │   └── attendance.enums.ts            /* PunchType, CaptureMethod, AttendanceStatus, etc. */
│           ├── services/
│           │   ├── attendance.service.ts          /* Multi-filter query and employee daily view */
│           │   ├── attendance-capture.service.ts  /* UNIFIED INGESTION ENGINE (ACID + Lock + Outbox) */
│           │   ├── attendance-calculation.service.ts /* DAILY ROLLUP CALCULATOR & SHIFT SNAPSHOTTER */
│           │   └── qr/
│           │       └── qr-session.service.ts      /* Dynamic JWT tokens & Redis ephemeral nonces */
│           └── workers/
│               └── attendance-queue.worker.ts     /* BullMQ worker & Transactional Outbox relay */
```

---

## 3. Database Schema Design (Prisma)

### Core Models
| Table | Description |
|---|---|
| `organizations` | Tenant entity with plan tier (`FREE`, `STARTER`, `BUSINESS`, `ENTERPRISE`) and seat limits. |
| `employees` | Employee profile scoped by tenant with composite unique `[orgId, email]` and `[orgId, employeeCode]`. |
| `shifts` | Working shift hours, overnight flag (`isOvernight`), and grace windows. |
| `attendance_settings` | Org-level work hours, half-day hours, weekly off-days (`weeklyOffDays`), and holiday linkages. |
| `holidays` | Organizational holiday calendar records. |
| `attendance_locations` | Office worksite coordinates, radius (meters), and enabled capture methods. |
| `attendance_devices` | Hardware biometric terminals (serial number, IP, hashed API key/secret, status). |
| `attendance_device_mappings` | Join relating employees to terminal-specific biometric enrollment IDs. |
| `attendance_punches` | Immutable physical punch ledger with client `idempotencyKey` and `businessDate`. |
| `attendance_records` | Aggregate daily summary with snapshotted shift policy values. |
| `attendance_regularizations` | Correction requests with manager/HR approval pipeline. |
| `attendance_wfh_requests` | Work From Home date range requests. |
| `outbox_events` | Transactional outbox table consumed by BullMQ queue relay. |
| `audit_logs` | Immutable audit trail for manual entries, overrides, and approvals. |

---

## 4. API Endpoints & Swagger Documentation

Interactive Swagger OpenAPI documentation is available locally at:
👉 **`http://localhost:4000/api/docs`**

### Active Endpoints

#### Dynamic QR Attendance (`/api/attendance/qr`)
* `POST /api/attendance/qr/session`: Kiosk displays request new dynamic QR session token (refreshes every 15–30s).
* `POST /api/attendance/qr/check-in`: Mobile scans QR to clock in. Atomically consumes nonce via Redis Lua script.
* `POST /api/attendance/qr/check-out`: Mobile scans QR to clock out.

#### Attendance Management & Queries (`/api/attendance`)
* `POST /api/attendance/manual`: HR/Admin manual punch exception (writes to `audit_logs`).
* `GET /api/attendance`: Paginated query with filters (`startDate`, `endDate`, `employeeId`, `status`, `page`, `limit`).
* `GET /api/attendance/:employeeId/:date`: Single employee day summary with punch timeline and snapshotted shift info.

---

## 5. Local Setup & Execution

### 1. Prerequisites
* **Node.js**: v22.x or later
* **PostgreSQL**: v15+ running on port `5432`
* **Redis**: v7+ running on port `6379`

### 2. Environment Configuration
Create or update `.env` in `emphrx-backend/`:
```env
PORT=4000
DATABASE_URL="postgresql://postgres:admin123@localhost:5432/emphrx_db?schema=public"
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
REDIS_PASSWORD=""
QR_JWT_SECRET="emphrx_super_secure_qr_signing_secret_key_2026"
```

### 3. Install Dependencies & Generate Prisma Client
```bash
npm install
npx prisma generate
npx prisma db push
```

### 4. Run End-to-End Phase 1 Verification Script
Runs an end-to-end integration test creating a tenant, shift, employee, dynamic QR session in Redis, anti-replay attack test, outbox event verification, and async calculation rollup:
```bash
npm run build
node dist/phase1-verify.js
```

### 5. Start Development Server
```bash
npm run start:dev
```
Access the application:
* Base API: `http://localhost:4000/api`
* Swagger Docs: `http://localhost:4000/api/docs`
