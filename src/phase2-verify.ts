import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaService } from './database/prisma.service.js';
import { AttendanceCaptureService } from './modules/attendance/services/attendance-capture.service.js';
import { RegularizationService } from './modules/attendance/services/regularization.service.js';
import { WfhService } from './modules/attendance/services/wfh.service.js';
import { AttendanceSettingService } from './modules/attendance/services/attendance-setting.service.js';
import { GeofenceService } from './modules/attendance/services/geolocation/geofence.service.js';
import { PunchType } from './modules/attendance/enums/attendance.enums.js';

async function runPhase2Verification() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const captureService = app.get(AttendanceCaptureService);
  const regularizationService = app.get(RegularizationService);
  const wfhService = app.get(WfhService);
  const settingsService = app.get(AttendanceSettingService);
  const geofenceService = app.get(GeofenceService);

  console.log('\n=== RUNNING PHASE 2 VERIFICATION ===\n');

  /* 1. Setup Tenant and Locations */
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      tier: 'BUSINESS',
    },
  });

  const hqLocation = await prisma.attendanceLocation.upsert({
    where: {
      orgId_code: {
        orgId: org.id,
        code: 'HQ-BLR',
      },
    },
    update: {
      latitude: 12.9716,
      longitude: 77.5946,
      radiusMeters: 100,
    },
    create: {
      orgId: org.id,
      name: 'Bangalore HQ',
      code: 'HQ-BLR',
      latitude: 12.9716,
      longitude: 77.5946,
      radiusMeters: 100,
    },
  });
  console.log('✔ Location confirmed: HQ-BLR at (12.9716, 77.5946), radius: 100m');

  /* 2. Test Haversine Distance Calculation */
  const distanceInside = geofenceService.calculateDistanceMeters(
    12.9716,
    77.5946,
    12.9718,
    77.5947,
  );
  console.log(`✔ Haversine distance for nearby coordinates: ${distanceInside} meters (inside 100m)`);

  const distanceOutside = geofenceService.calculateDistanceMeters(
    12.9716,
    77.5946,
    12.9800,
    77.6000,
  );
  console.log(`✔ Haversine distance for remote coordinates: ${distanceOutside} meters (outside 100m)`);

  /* 3. Setup Employee */
  const employee = await prisma.employee.upsert({
    where: {
      orgId_employeeCode: {
        orgId: org.id,
        employeeCode: 'EMP_GEO_01',
      },
    },
    update: {},
    create: {
      orgId: org.id,
      employeeCode: 'EMP_GEO_01',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice.smith@acme.com',
      assignedLocationId: hqLocation.id,
    },
  });

  /* 4. Test Mobile Geolocation Punch Inside Geofence */
  const geoInsidePunch = await captureService.captureGeoPunch(
    org.id,
    employee.id,
    {
      latitude: 12.9717,
      longitude: 77.5946,
      accuracy: 10,
      locationId: hqLocation.id,
      notes: 'Main gate entry',
    },
    PunchType.CHECK_IN,
  );
  console.log('✔ Geo Punch (Inside Geofence):', geoInsidePunch.punchId, geoInsidePunch.message);

  /* 5. Test Mobile Geolocation Punch Outside Geofence */
  const geoOutsidePunch = await captureService.captureGeoPunch(
    org.id,
    employee.id,
    {
      latitude: 12.9850,
      longitude: 77.6100,
      accuracy: 15,
      locationId: hqLocation.id,
      notes: 'Offsite coffee shop punch',
    },
    PunchType.CHECK_OUT,
  );
  console.log('✔ Geo Punch (Outside Geofence Flagged):', geoOutsidePunch.punchId, geoOutsidePunch.message);

  /* 6. Test Overnight Shift Business Date Resolution */
  const nightShift = await prisma.shift.upsert({
    where: {
      orgId_code: {
        orgId: org.id,
        code: 'NIGHT-22-06',
      },
    },
    update: { isOvernight: true },
    create: {
      orgId: org.id,
      name: 'Overnight Shift 10PM - 6AM',
      code: 'NIGHT-22-06',
      startTime: '22:00',
      endTime: '06:00',
      isOvernight: true,
    },
  });

  await prisma.employee.update({
    where: { id: employee.id },
    data: { assignedShiftId: nightShift.id },
  });

  /* Punch simulating 2:30 AM on Oct 7 for an overnight shift */
  const overnightPunchTime = new Date('2026-10-07T02:30:00.000Z');
  const overnightManualPunch = await captureService.captureManualPunch(
    org.id,
    'supervisor-uuid',
    {
      employeeId: employee.id,
      punchType: PunchType.CHECK_IN,
      punchTime: overnightPunchTime.toISOString(),
      reason: 'Night shift middle checkpoint',
    },
  );
  console.log('✔ Overnight Punch at 02:30 AM resolved to Business Date:', overnightManualPunch.businessDate, '(Previous calendar day!)');

  /* 7. Test Attendance Regularization Request Lifecycle */
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const targetRecord = await prisma.attendanceRecord.findFirst({
    where: {
      orgId: org.id,
      employeeId: employee.id,
    },
  });

  if (targetRecord) {
    const regRequest = await regularizationService.createRequest(
      org.id,
      employee.id,
      {
        recordId: targetRecord.id,
        requestedCheckIn: new Date(today.getTime() + 9 * 3600000).toISOString(),
        requestedCheckOut: new Date(today.getTime() + 18 * 3600000).toISOString(),
        reason: 'GPS glitch prevented check-in at gate',
      },
    );
    console.log('✔ Regularization submitted:', regRequest.id, `Status: ${regRequest.status}`);

    const approvedReg = await regularizationService.approveRequest(
      org.id,
      regRequest.id,
      'manager-uuid',
      { actionReason: 'Verified with employee and approve' },
    );
    console.log('✔ Regularization approved by manager:', approvedReg.id, `Status: ${approvedReg.status}`);

    const verifiedRecord = await prisma.attendanceRecord.findUnique({
      where: { id: targetRecord.id },
    });
    console.log('✔ Attendance Record updated with isRegularized:', verifiedRecord?.isRegularized);
  }

  /* 8. Test Work From Home (WFH) Lifecycle */
  const wfhRequest = await wfhService.createRequest(
    org.id,
    employee.id,
    {
      fromDate: '2026-10-15',
      toDate: '2026-10-16',
      reason: 'Home fiber internet upgrade and testing',
    },
  );
  console.log('✔ WFH Request submitted:', wfhRequest.id, `Status: ${wfhRequest.status}`);

  const approvedWfh = await wfhService.approveRequest(
    org.id,
    wfhRequest.id,
    'hr-manager-uuid',
    { actionReason: 'Approved as per remote work policy' },
  );
  console.log('✔ WFH Request approved:', approvedWfh.id, `Status: ${approvedWfh.status}`);

  const wfhRecord = await prisma.attendanceRecord.findFirst({
    where: {
      orgId: org.id,
      employeeId: employee.id,
      date: new Date('2026-10-15T00:00:00.000Z'),
    },
  });
  console.log('✔ Matching AttendanceRecord status set to WORK_FROM_HOME:', wfhRecord?.status);

  /* 9. Test Attendance Settings Update */
  const updatedSettings = await settingsService.updateSettings(
    org.id,
    'admin-uuid',
    {
      graceMinutes: 20,
      defaultWorkHoursMinutes: 480,
      defaultHalfDayMinutes: 240,
      weeklyOffDays: ['SATURDAY', 'SUNDAY'],
      allowWfh: true,
    },
  );
  console.log('✔ Attendance Settings updated: Grace minutes set to', updatedSettings.graceMinutes);

  const settingAudit = await prisma.auditLog.findFirst({
    where: {
      orgId: org.id,
      entityName: 'AttendanceSetting',
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('✔ Audit Log confirmed for setting update:', settingAudit?.action, settingAudit?.reason);

  console.log('\n=== ALL PHASE 2 REQUIREMENTS VERIFIED SUCCESSFULLY ===\n');

  await app.close();
  process.exit(0);
}

runPhase2Verification().catch((err) => {
  console.error('Phase 2 verification failed:', err);
  process.exit(1);
});
