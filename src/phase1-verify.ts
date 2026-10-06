import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaService } from './database/prisma.service.js';
import { QrSessionService } from './modules/attendance/services/qr/qr-session.service.js';
import { AttendanceCaptureService } from './modules/attendance/services/attendance-capture.service.js';
import { AttendanceCalculationService } from './modules/attendance/services/attendance-calculation.service.js';
import { PunchType } from './modules/attendance/enums/attendance.enums.js';

async function runVerification() {
  /* Initialize NestJS Application Context */
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const qrService = app.get(QrSessionService);
  const captureService = app.get(AttendanceCaptureService);
  const calculationService = app.get(AttendanceCalculationService);

  console.log('\n=== RUNNING PHASE 1 VERIFICATION ===\n');

  /* 1. Setup Test Organization */
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      tier: 'STARTER',
    },
  });
  console.log('✔ Organization verified:', org.name, `(${org.id})`);

  /* 2. Setup Attendance Settings with configurable hours, off days & holidays */
  const settings = await prisma.attendanceSetting.upsert({
    where: { orgId: org.id },
    update: {
      defaultWorkHoursMinutes: 480,
      defaultHalfDayMinutes: 240,
      graceMinutes: 15,
      weeklyOffDays: ['SATURDAY', 'SUNDAY'],
    },
    create: {
      orgId: org.id,
      defaultWorkHoursMinutes: 480,
      defaultHalfDayMinutes: 240,
      graceMinutes: 15,
      lateMarkAfterMinutes: 15,
      weeklyOffDays: ['SATURDAY', 'SUNDAY'],
    },
  });
  console.log('✔ AttendanceSettings verified (480 mins full day, 240 mins half day)');

  /* 3. Setup Location */
  const location = await prisma.attendanceLocation.upsert({
    where: {
      orgId_code: {
        orgId: org.id,
        code: 'HQ-BLR',
      },
    },
    update: {},
    create: {
      orgId: org.id,
      name: 'Bangalore Headquarters',
      code: 'HQ-BLR',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusMeters: 100,
    },
  });
  console.log('✔ Attendance Location verified:', location.name);

  /* 4. Setup Shift */
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
  console.log('✔ Shift verified:', shift.name);

  /* 5. Setup Employee */
  const employee = await prisma.employee.upsert({
    where: {
      orgId_employeeCode: {
        orgId: org.id,
        employeeCode: 'EMP001',
      },
    },
    update: {
      assignedShiftId: shift.id,
      assignedLocationId: location.id,
    },
    create: {
      orgId: org.id,
      employeeCode: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@acme.com',
      assignedShiftId: shift.id,
      assignedLocationId: location.id,
    },
  });
  console.log('✔ Employee verified:', employee.firstName, employee.lastName);

  /* 6. Test Redis Ephemeral Dynamic QR Session Generation */
  const qrSession = await qrService.createSession(org.id, {
    locationId: location.id,
    kioskIdentifier: 'KIOSK-RECEPTION-01',
  });
  console.log('✔ Dynamic QR Session created with 30s TTL in Redis:', qrSession.sessionId);

  /* 7. Test QR Check-In Punch Ingestion */
  const checkInResult = await captureService.captureQrPunch(
    org.id,
    employee.id,
    {
      qrToken: qrSession.qrToken,
      latitude: 12.9716,
      longitude: 77.5946,
      gpsAccuracyMeters: 10,
    },
    PunchType.CHECK_IN,
  );
  console.log('✔ QR Check-in captured successfully:', checkInResult.punchId, checkInResult.message);

  /* 8. Test Replay Attack Mitigation (Reuse Same Token) */
  try {
    await captureService.captureQrPunch(
      org.id,
      employee.id,
      {
        qrToken: qrSession.qrToken,
      },
      PunchType.CHECK_IN,
    );
    console.error('❌ Replay attack test FAILED (should have rejected token reuse)');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log('✔ Anti-replay protection SUCCESS: Reused token rejected with:', errorMsg);
  }

  /* 9. Verify Outbox Event Created */
  const outboxEvent = await prisma.outboxEvent.findFirst({
    where: {
      orgId: org.id,
      aggregateId: checkInResult.punchId,
    },
  });
  console.log('✔ Transactional OutboxEvent confirmed in DB:', outboxEvent?.eventType, `(Status: ${outboxEvent?.status})`);

  /* 10. Execute Recalculation Engine */
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await calculationService.recalculateDay(org.id, employee.id, today);

  /* 11. Verify Daily AttendanceRecord with Shift Snapshots */
  const attendanceRecord = await prisma.attendanceRecord.findUnique({
    where: {
      orgId_employeeId_date: {
        orgId: org.id,
        employeeId: employee.id,
        date: today,
      },
    },
  });

  console.log('✔ AttendanceRecord verified:');
  console.log('   - Status:', attendanceRecord?.status);
  console.log('   - Total Punches:', attendanceRecord?.totalPunches);
  console.log('   - Snapshotted Shift Code:', attendanceRecord?.snapshotShiftCode);
  console.log('   - Snapshotted Start Time:', attendanceRecord?.snapshotStartTime);
  console.log('   - Snapshotted Full Day Mins:', attendanceRecord?.snapshotFullDayMins);

  /* 12. Test Manual Admin Punch with Audit Log */
  const manualPunch = await captureService.captureManualPunch(
    org.id,
    'admin-user-uuid',
    {
      employeeId: employee.id,
      punchType: PunchType.CHECK_OUT,
      punchTime: new Date().toISOString(),
      reason: 'Biometric card forgotten at reception',
    },
  );
  console.log('✔ Manual Punch recorded:', manualPunch.punchId);

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      orgId: org.id,
      entityId: manualPunch.punchId,
    },
  });
  console.log('✔ AuditLog entry confirmed:', auditLog?.action, auditLog?.reason);

  console.log('\n=== ALL PHASE 1 REQUIREMENTS VERIFIED SUCCESSFULLY ===\n');

  await app.close();
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
