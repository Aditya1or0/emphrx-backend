# EmpHrx Engineering & Coding Standards

This document establishes the mandatory architectural standards, coding conventions, folder structures, response contracts, and commenting guidelines for the EmpHrx codebase.

---

## 1. Unified API Response Envelope

All API endpoints must conform to a predictable response envelope.

### 1.1 Success Response Contract
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "totalPages": 6
  }
}
```

### 1.2 Error Response Contract
```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Geofence validation failed: Coordinates are 350m outside allowed radius",
  "timestamp": "2026-10-06T13:00:00.000Z",
  "path": "/api/attendance/geo/check-in"
}
```

Implementation:
* Standard responses are automatically formatted via `TransformInterceptor`.
* Errors are caught and normalized globally via `HttpExceptionFilter`.

---

## 2. Directory & Module Structure Conventions

Every domain module under `src/modules/<module-name>/` must follow this normalized folder structure:

```
src/modules/<module-name>/
├── <module-name>.module.ts       /* Wires controllers, services, and repositories */
├── controllers/                  /* HTTP controllers only; zero business logic */
├── services/                     /* Domain orchestration & business logic */
├── repositories/                 /* Data access layer; encapsulates PrismaClient */
├── dto/                          /* Validated request and response schemas (class-validator + Swagger) */
├── enums/                        /* System-wide TypeScript enums; NO magic strings */
├── types/                        /* Domain interfaces and internal payload types */
├── workers/                      /* BullMQ queue processors and background jobs */
├── policies/                     /* Domain rules, validators, calculators */
└── tests/                        /* Unit & integration tests for the module */
```

### Architectural Separation
1. **Controllers**: Pure request deserialization, Swagger decoration, and calling services. No direct database access.
2. **Services**: Business rules, concurrency locks, event dispatching, and orchestration.
3. **Repositories**: Concrete data access methods (`create`, `findById`, `findManyWithFilters`, `update`, `upsert`). Isolates Prisma queries from business logic.

---

## 3. Commenting Standard

* **Syntax**: Use standard multi-line C-style comments only:
  ```typescript
  /* comments should be this */
  ```
* **No AI Boilerplate**: Never insert separator banners, horizontal lines, or decorative ASCII art such as:
  ```typescript
  /* FORBIDDEN: */
  // -------------------------------------------------------------
  // 5. IMMUTABLE RAW PUNCHES (AUDITABLE LEDGER)
  // =============================================================
  ```
* **Purpose**: Comments must explain *why* non-obvious domain logic exists (e.g. overnight shift business date math, Lua script atomic nonce invalidation), not repeat what the code obviously does.

---

## 4. Concurrency, Transactions & Race Condition Handling

1. **Redis Debounce Locks**:
   * Any punch endpoint (QR, Geo, Device) must acquire a Redis lock before executing:
     `lock:punch:{employeeId}:{businessDate}` (TTL: 5s).
   * Prevents double-taps or duplicate mobile submissions.
2. **ACID Transaction Boundaries**:
   * Writing a punch and publishing an `OutboxEvent` must ALWAYS happen inside `prisma.$transaction`.
   * Never write a punch and send a message outside the database transaction.
3. **Idempotency Keys**:
   * Mobile and external clients should supply a UUID `idempotencyKey` backed by a unique constraint in `attendance_punches`.

---

## 5. Type Safety & Validation Rules

1. **No Magic Strings**:
   * All statuses, punch types, actions, and tiers must be strongly typed TypeScript enums (`PunchType`, `CaptureMethod`, `AttendanceStatus`, `RequestStatus`).
2. **DTO Validation**:
   * Every controller input must use a DTO decorated with `class-validator` rules (`@IsUUID()`, `@IsNotEmpty()`, `@IsEnum()`, `@IsNumber()`).
   * Fastify must run `ValidationPipe` with `{ whitelist: true, transform: true, forbidNonWhitelisted: true }`.
3. **Multi-Tenant Scoping**:
   * Always scope queries by `orgId`.
   * Compound uniqueness: `@@unique([orgId, email])`, `@@unique([orgId, employeeCode])`.
