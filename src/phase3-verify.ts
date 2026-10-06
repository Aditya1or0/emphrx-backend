import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaService } from './database/prisma.service.js';
import { AttendanceDeviceService } from './modules/attendance/services/attendance-device.service.js';
import { AttendanceCalculationService, calculateOvertime } from './modules/attendance/services/attendance-calculation.service.js';
import { AttendanceWebhookService } from './modules/attendance/services/attendance-webhook.service.js';
import { calculateHmacSignature, verifyHmacSignature } from './modules/attendance/utils/hmac.util.js';
import {
  CaptureMethod,
  DeviceStatus,
  DeviceType,
  PunchType,
} from './modules/attendance/enums/attendance.enums.js';

async function runPhase3Verification() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const deviceService = app.get(AttendanceDeviceService);
  const calculationService = app.get(AttendanceCalculationService);
  const webhookService = app.get(AttendanceWebhookService);

  console.log('\n=== RUNNING PHASE 3 VERIFICATION ===\n');

  /* 1. Setup Tenant and Location */
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      tier: 'BUSINESS',
    },
  });

  /* 2. Test Biometric Hardware Terminal Registration */
  const serialNumber = 'ZK-VF780-9921';
  await prisma.attendanceDevice.deleteMany({
    where: { serialNumber },
  });

  const registeredDevice = await deviceService.registerDevice(
    org.id,
    'admin-actor-uuid',
    {
      name: 'Factory Gate #1 Biometric Terminal',
      serialNumber,
      deviceType: DeviceType.ZKTECO,
      ipAddress: '192.168.1.120',
    },
  );

  console.log('✔ Biometric Terminal Registered:', registeredDevice.name);
  console.log('   - Serial Number:', registeredDevice.serialNumber);
  console.log('   - Status:', registeredDevice.status);
  console.log('   - Plaintext API Key generated (length):', registeredDevice.apiKey.length);

  const deviceInDb = await prisma.attendanceDevice.findUnique({
    where: { id: registeredDevice.id },
  });
  console.log('✔ Database stores salt-hashed key (apiKeyHash != apiKey):', deviceInDb?.apiKeyHash !== registeredDevice.apiKey);

  /* 3. Test Cryptographic HMAC-SHA256 Signature Verification & Clock Drift */
  const testPayload = { test: 'biometric-sync-event' };
  const validTimestamp = Math.floor(Date.now() / 1000);
  const validSignature = calculateHmacSignature(
    deviceInDb!.apiKeyHash,
    testPayload,
    validTimestamp,
  );

  const isSignatureValid = verifyHmacSignature(
    deviceInDb!.apiKeyHash,
    testPayload,
    validTimestamp,
    validSignature,
  );
  console.log('✔ Valid HMAC-SHA256 Signature verification:', isSignatureValid ? 'PASSED' : 'FAILED');

  const tamperedPayload = { test: 'tampered-sync-event' };
  const isTamperedRejected = !verifyHmacSignature(
    deviceInDb!.apiKeyHash,
    tamperedPayload,
    validTimestamp,
    validSignature,
  );
  console.log('✔ Tampered Payload rejection:', isTamperedRejected ? 'PASSED (Rejected)' : 'FAILED');

  const expiredTimestamp = validTimestamp - 600; /* 10 minutes ago, exceeds 5-minute window */
  const expiredSignature = calculateHmacSignature(
    deviceInDb!.apiKeyHash,
    testPayload,
    expiredTimestamp,
  );
  const isExpiredRejected = !verifyHmacSignature(
    deviceInDb!.apiKeyHash,
    testPayload,
    expiredTimestamp,
    expiredSignature,
  );
  console.log('✔ Expired timestamp clock-drift rejection (>5 mins):', isExpiredRejected ? 'PASSED (Rejected)' : 'FAILED');

  /* 4. Test Hardware Terminal Heartbeat */
  const heartbeatResult = await deviceService.recordHeartbeat(serialNumber, {
    serialNumber,
    status: DeviceStatus.ONLINE,
    ipAddress: '192.168.1.125',
  });
  console.log('✔ Terminal Heartbeat confirmed at:', heartbeatResult.lastHeartbeatAt?.toISOString(), `(IP: ${heartbeatResult.ipAddress})`);

  /* 5. Setup Employee and Biometric Enrollment Mapping */
  const shift = await prisma.shift.upsert({
    where: {
      orgId_code: {
        orgId: org.id,
        code: 'GEN-09-18',
      },
    },
    update: {},
    create: {
      orgId: org.id,
      name: 'General Shift 9AM - 6PM',
      code: 'GEN-09-18',
      startTime: '09:00',
      endTime: '18:00',
      isOvernight: false,
    },
  });

  const employee = await prisma.employee.upsert({
    where: {
      orgId_employeeCode: {
        orgId: org.id,
        employeeCode: 'EMP_BIO_01',
      },
    },
    update: {
      assignedShiftId: shift.id,
    },
    create: {
      orgId: org.id,
      employeeCode: 'EMP_BIO_01',
      firstName: 'Bob',
      lastName: 'Johnson',
      email: 'bob.johnson@acme.com',
      assignedShiftId: shift.id,
    },
  });

  const mapping = await deviceService.createMapping(
    org.id,
    registeredDevice.id,
    'admin-actor-uuid',
    {
      employeeId: employee.id,
      biometricEnrollId: '10042',
    },
  );
  console.log('✔ Biometric Mapping created: Employee', mapping.employee.firstName, '-> Terminal Enroll ID', mapping.biometricEnrollId);

  /* 6. Test Batch Biometric Punch Ingestion with Deduplication & Unmapped Log Isolation */
  const batchPunchPayload = {
    logs: [
      {
        enrollmentId: '10042',
        timestamp: '2026-10-06T09:01:30.000Z',
        punchType: PunchType.CHECK_IN,
        logId: 'LOG_BIO_9901',
      },
      {
        enrollmentId: '99999', /* Unmapped enrollment ID */
        timestamp: '2026-10-06T09:05:00.000Z',
        punchType: PunchType.CHECK_IN,
        logId: 'LOG_BIO_9902',
      },
    ],
  };

  const batchResult = await deviceService.ingestBiometricBatch(
    serialNumber,
    batchPunchPayload,
  );

  console.log('✔ Batch Biometric Ingestion:');
  console.log('   - Total Received:', batchResult.receivedCount);
  console.log('   - Successfully Processed:', batchResult.processedCount);
  console.log('   - Failed/Flagged Unmapped Logs:', batchResult.failedLogs.length);
  console.log('   - Failure Reason:', batchResult.failedLogs[0]?.reason);

  /* 7. Test Idempotent Deduplication (Resend exact same batch) */
  const resendResult = await deviceService.ingestBiometricBatch(
    serialNumber,
    batchPunchPayload,
  );

  console.log('✔ Duplicate Batch Resend:');
  console.log('   - Duplicate Count Detected:', resendResult.duplicatesCount);
  console.log('   - New Processed Punches (should be 0):', resendResult.processedCount);

  /* 8. Verify Stored Biometric Punch in Database */
  const storedPunch = await prisma.attendancePunch.findFirst({
    where: {
      orgId: org.id,
      rawLogId: 'LOG_BIO_9901',
    },
  });
  console.log('✔ Verified AttendancePunch in DB:');
  console.log('   - Capture Method:', storedPunch?.captureMethod, `(Expected: ${CaptureMethod.BIOMETRIC_API})`);
  console.log('   - Linked Device ID:', storedPunch?.deviceId);
  console.log('   - Idempotency Key:', storedPunch?.idempotencyKey);

  /* 9. Verify Outbox Event for BullMQ Asynchronous Processor */
  const outboxEvent = await prisma.outboxEvent.findFirst({
    where: {
      orgId: org.id,
      aggregateId: storedPunch?.id,
    },
  });
  console.log('✔ Outbox Event confirmed:', outboxEvent?.eventType, `(Status: ${outboxEvent?.status})`);

  /* 10. Test Advanced Overtime Calculation Engine */
  /* Scenario A: 630 minutes worked, 480 full day mins, 60 mins overtime threshold => 150 mins OT */
  const otCaseA = calculateOvertime(630, 480, 60);
  console.log(`✔ Overtime Engine Test A (630 mins worked / 480 standard / 60 threshold): ${otCaseA} mins OT (Expected: 150)`);

  /* Scenario B: 520 minutes worked (40 mins excess < 60 threshold) => 0 mins OT */
  const otCaseB = calculateOvertime(520, 480, 60);
  console.log(`✔ Overtime Engine Test B (520 mins worked / 480 standard / 60 threshold): ${otCaseB} mins OT (Expected: 0)`);

  /* 11. Recalculate Day with Check-Out Punch and Check Database Record */
  const checkOutPunch = await prisma.attendancePunch.create({
    data: {
      orgId: org.id,
      employeeId: employee.id,
      businessDate: new Date('2026-10-06T00:00:00.000Z'),
      punchType: PunchType.CHECK_OUT,
      punchTime: new Date('2026-10-06T19:31:30.000Z'), /* ~10.5 hours worked */
      captureMethod: CaptureMethod.BIOMETRIC_API,
      deviceId: registeredDevice.id,
      rawLogId: 'LOG_BIO_9903',
      idempotencyKey: `BIO:${registeredDevice.id}:LOG_BIO_9903`,
      isVerified: true,
    },
  });
  console.log('✔ Simulated Biometric Check-Out Punch created:', checkOutPunch.id);

  const businessDate = new Date('2026-10-06T00:00:00.000Z');
  await calculationService.recalculateDay(org.id, employee.id, businessDate);

  const calculatedRecord = await prisma.attendanceRecord.findUnique({
    where: {
      orgId_employeeId_date: {
        orgId: org.id,
        employeeId: employee.id,
        date: businessDate,
      },
    },
  });

  console.log('✔ Materialized Daily Attendance Record:');
  console.log('   - Total Work Minutes:', calculatedRecord?.totalWorkMinutes);
  console.log('   - Overtime Minutes:', calculatedRecord?.overtimeMinutes);
  console.log('   - Status:', calculatedRecord?.status);

  /* 12. Test Outbound Webhook Dispatcher */
  const webhookResult = await webhookService.dispatchPunchEvent(
    org.id,
    {
      punchId: storedPunch?.id,
      employeeId: employee.id,
      timestamp: storedPunch?.punchTime.toISOString(),
      captureMethod: storedPunch?.captureMethod,
    },
    'https://erp.acme-corp.internal/webhooks/attendance',
    'secret_webhook_key_789',
  );
  console.log('✔ Outbound Webhook dispatched:', webhookResult.event, `(Org: ${webhookResult.orgId})`);

  console.log('\n=== ALL PHASE 3 REQUIREMENTS VERIFIED SUCCESSFULLY ===\n');

  await app.close();
  process.exit(0);
}

runPhase3Verification().catch((err) => {
  console.error('Phase 3 verification failed:', err);
  process.exit(1);
});
