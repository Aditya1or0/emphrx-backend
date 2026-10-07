import { Module } from '@nestjs/common';
import { QrAttendanceController } from './controllers/qr-attendance.controller.js';
import { GeoAttendanceController } from './controllers/geo-attendance.controller.js';
import { AttendanceController } from './controllers/attendance.controller.js';
import { RegularizationController } from './controllers/regularization.controller.js';
import { WfhController } from './controllers/wfh.controller.js';
import { AttendanceSettingController } from './controllers/attendance-setting.controller.js';
import { AttendanceDeviceController } from './controllers/attendance-device.controller.js';
import { AttendanceAnalyticsController } from './controllers/attendance-analytics.controller.js';

import { QrSessionService } from './services/qr/qr-session.service.js';
import { GeofenceService } from './services/geolocation/geofence.service.js';
import { AttendanceCaptureService } from './services/attendance-capture.service.js';
import { AttendanceCalculationService } from './services/attendance-calculation.service.js';
import { AttendanceQueueWorker } from './workers/attendance-queue.worker.js';
import { AttendanceService } from './services/attendance.service.js';
import { RegularizationService } from './services/regularization.service.js';
import { WfhService } from './services/wfh.service.js';
import { AttendanceSettingService } from './services/attendance-setting.service.js';
import { AttendanceDeviceService } from './services/attendance-device.service.js';
import { AttendanceWebhookService } from './services/attendance-webhook.service.js';
import { TierEntitlementService } from './services/tier-entitlement.service.js';
import { AttendanceAnalyticsService } from './services/attendance-analytics.service.js';
import { AttendanceExportService } from './services/attendance-export.service.js';

import { AttendancePunchRepository } from './repositories/attendance-punch.repository.js';
import { AttendanceRecordRepository } from './repositories/attendance-record.repository.js';
import { AttendanceLocationRepository } from './repositories/attendance-location.repository.js';
import { AttendanceRegularizationRepository } from './repositories/attendance-regularization.repository.js';
import { AttendanceWfhRepository } from './repositories/attendance-wfh.repository.js';
import { AttendanceSettingRepository } from './repositories/attendance-setting.repository.js';
import { AttendanceDeviceRepository } from './repositories/attendance-device.repository.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { DeviceHmacGuard } from './guards/device-hmac.guard.js';

@Module({
  controllers: [
    QrAttendanceController,
    GeoAttendanceController,
    AttendanceController,
    RegularizationController,
    WfhController,
    AttendanceSettingController,
    AttendanceDeviceController,
    AttendanceAnalyticsController,
  ],
  providers: [
    /* Domain Services */
    QrSessionService,
    GeofenceService,
    AttendanceCaptureService,
    AttendanceCalculationService,
    AttendanceQueueWorker,
    AttendanceService,
    RegularizationService,
    WfhService,
    AttendanceSettingService,
    AttendanceDeviceService,
    AttendanceWebhookService,
    TierEntitlementService,
    AttendanceAnalyticsService,
    AttendanceExportService,

    /* Security Guards */
    DeviceHmacGuard,

    /* Repositories */
    AttendancePunchRepository,
    AttendanceRecordRepository,
    AttendanceLocationRepository,
    AttendanceRegularizationRepository,
    AttendanceWfhRepository,
    AttendanceSettingRepository,
    AttendanceDeviceRepository,
    AuditLogRepository,
  ],
  exports: [
    AttendanceCaptureService,
    AttendanceCalculationService,
    AttendanceService,
    RegularizationService,
    WfhService,
    AttendanceSettingService,
    AttendanceDeviceService,
    AttendanceWebhookService,
    TierEntitlementService,
    AttendanceAnalyticsService,
    AttendanceExportService,
    AttendancePunchRepository,
    AttendanceRecordRepository,
    AttendanceLocationRepository,
    AttendanceRegularizationRepository,
    AttendanceWfhRepository,
    AttendanceSettingRepository,
    AttendanceDeviceRepository,
    AuditLogRepository,
  ],
})
export class AttendanceModule {}
