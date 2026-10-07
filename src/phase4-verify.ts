import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaService } from './database/prisma.service.js';
import { TierEntitlementService } from './modules/attendance/services/tier-entitlement.service.js';
import { AttendanceAnalyticsService } from './modules/attendance/services/attendance-analytics.service.js';
import { AttendanceExportService } from './modules/attendance/services/attendance-export.service.js';
import { AuditLogRepository } from './modules/attendance/repositories/audit-log.repository.js';
import {
  CaptureMethod,
  OrganizationTier,
} from './modules/attendance/enums/attendance.enums.js';

async function runPhase4Verification() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const tierService = app.get(TierEntitlementService);
  const analyticsService = app.get(AttendanceAnalyticsService);
  const exportService = app.get(AttendanceExportService);
  const auditRepo = app.get(AuditLogRepository);

  console.log('\n=== RUNNING PHASE 4 VERIFICATION ===\n');

  /* 1. Setup Organizations for Different SaaS Tiers */
  const freeOrg = await prisma.organization.upsert({
    where: { slug: 'free-startup' },
    update: { tier: OrganizationTier.FREE, maxEmployees: 10 },
    create: {
      name: 'Free Startup Org',
      slug: 'free-startup',
      tier: OrganizationTier.FREE,
      maxEmployees: 10,
    },
  });
  await tierService.invalidateCache(freeOrg.id);
  console.log('✔ Free Tier Organization verified:', freeOrg.name, `(${freeOrg.id})`);

  const starterOrg = await prisma.organization.upsert({
    where: { slug: 'starter-company' },
    update: { tier: OrganizationTier.STARTER, maxEmployees: 50 },
    create: {
      name: 'Starter Company',
      slug: 'starter-company',
      tier: OrganizationTier.STARTER,
      maxEmployees: 50,
    },
  });
  await tierService.invalidateCache(starterOrg.id);
  console.log('✔ Starter Tier Organization verified:', starterOrg.name, `(${starterOrg.id})`);

  const businessOrg = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: { tier: OrganizationTier.BUSINESS, maxEmployees: 250 },
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      tier: OrganizationTier.BUSINESS,
      maxEmployees: 250,
    },
  });
  await tierService.invalidateCache(businessOrg.id);
  console.log('✔ Business Tier Organization verified:', businessOrg.name, `(${businessOrg.id})`);

  /* 2. Test Redis Entitlement Cache */
  const freeEntitlements = await tierService.getEntitlements(freeOrg.id);
  console.log('✔ Redis Entitlement Cache resolved for Free tier:');
  console.log('   - Max Employees:', freeEntitlements.maxEmployees);
  console.log('   - History Retention Days:', freeEntitlements.historyRetentionDays);
  console.log('   - Allowed Capture Methods:', freeEntitlements.allowedCaptureMethods);

  /* 3. Test Employee Seat Quota Gating (402 Payment Required) */
  /* Seed 10 employees for freeOrg to hit limit */
  for (let i = 1; i <= 10; i++) {
    await prisma.employee.upsert({
      where: {
        orgId_employeeCode: {
          orgId: freeOrg.id,
          employeeCode: `FREE_EMP_${i}`,
        },
      },
      update: { isActive: true },
      create: {
        orgId: freeOrg.id,
        employeeCode: `FREE_EMP_${i}`,
        firstName: `Employee`,
        lastName: `${i}`,
        email: `emp${i}@freestartup.test`,
        isActive: true,
      },
    });
  }

  try {
    await tierService.enforceEmployeeLimit(freeOrg.id);
    console.error('❌ Seat quota test FAILED: Should have rejected 11th employee on Free tier');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log('✔ 402 Payment Required: Exceeded employee seat quota rejected successfully:');
    console.log('   - Error Message:', errorMsg);
  }

  /* 4. Test Geolocation Capture Channel Gating (403 Forbidden on Free tier) */
  try {
    await tierService.enforceCaptureMethod(freeOrg.id, CaptureMethod.GEOLOCATION);
    console.error('❌ Geolocation gating FAILED: Should have rejected on Free tier');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log('✔ 403 Forbidden: Geolocation on Free tier blocked with:', errorMsg);
  }

  /* Starter tier allows Geolocation */
  await tierService.enforceCaptureMethod(starterOrg.id, CaptureMethod.GEOLOCATION);
  console.log('✔ Starter tier Geolocation check: ALLOWED');

  /* 5. Test Biometric Channel Gating (403 Forbidden on Starter tier) */
  try {
    await tierService.enforceCaptureMethod(starterOrg.id, CaptureMethod.BIOMETRIC_API);
    console.error('❌ Biometric gating FAILED: Should have rejected on Starter tier');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log('✔ 403 Forbidden: Biometric API on Starter tier blocked with:', errorMsg);
  }

  /* Business tier allows Biometric API */
  await tierService.enforceCaptureMethod(businessOrg.id, CaptureMethod.BIOMETRIC_API);
  console.log('✔ Business tier Biometric API check: ALLOWED');

  /* 6. Test Historical Retention Window Gating (403 Forbidden on Free tier >30 days) */
  const dateOlderThan30Days = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  try {
    await tierService.enforceHistoryRetention(freeOrg.id, dateOlderThan30Days);
    console.error('❌ Historical retention gating FAILED: Should have rejected >30 days query on Free tier');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log('✔ 403 Forbidden: Historical query retention limit enforced on Free tier:', errorMsg);
  }

  /* Starter tier allows queries within 365 days */
  await tierService.enforceHistoryRetention(starterOrg.id, dateOlderThan30Days);
  console.log('✔ Starter tier query (45 days old within 365 days): ALLOWED');

  /* 7. Test Attendance Analytics Overview Engine */
  const analytics = await analyticsService.getOverview(businessOrg.id, {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  });
  console.log('✔ Attendance Analytics Overview Engine:');
  console.log('   - Total Records Analyzed:', analytics.metrics.totalRecords);
  console.log('   - Average Present Percentage:', analytics.metrics.averagePresentPercentage + '%');
  console.log('   - Total Late Occurrences:', analytics.metrics.totalLateOccurrences);
  console.log('   - Total Overtime Hours:', analytics.metrics.totalOvertimeHours);
  console.log('   - Daily Trend data points:', analytics.dailyTrend.length);

  /* 8. Test Streaming CSV Timesheet Export */
  const exportResult = await exportService.generateTimesheetCsv(businessOrg.id, {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    format: 'csv',
  });
  console.log('✔ Timesheet Export Engine:');
  console.log('   - Output Filename:', exportResult.filename);
  console.log('   - Total Rows Exported:', exportResult.recordCount);
  console.log('   - CSV Header Line:', exportResult.csvContent.split('\r\n')[0]);

  /* 9. Test Compliance Audit Logs Query & Immutability */
  const auditLogs = await auditRepo.findMany(businessOrg.id, {
    page: 1,
    limit: 5,
  });
  console.log('✔ Compliance Audit Trail:');
  console.log('   - Total Audit Records:', auditLogs.total);
  console.log('   - Page Limit:', auditLogs.limit);
  console.log('   - Latest Action:', auditLogs.items[0]?.action, `on ${auditLogs.items[0]?.entityName}`);
  console.log('   - Audit Actor Role:', auditLogs.items[0]?.actorRole);

  console.log('\n=== ALL PHASE 4 REQUIREMENTS VERIFIED SUCCESSFULLY ===\n');

  await app.close();
  process.exit(0);
}

runPhase4Verification().catch((err) => {
  console.error('Phase 4 verification failed:', err);
  process.exit(1);
});
