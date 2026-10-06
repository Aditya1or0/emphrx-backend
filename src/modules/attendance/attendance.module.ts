import { Module } from '@nestjs/common';
import { QrAttendanceController } from './controllers/qr-attendance.controller.js';
import { AttendanceController } from './controllers/attendance.controller.js';
import { QrSessionService } from './services/qr/qr-session.service.js';
import { AttendanceCaptureService } from './services/attendance-capture.service.js';
import { AttendanceCalculationService } from './services/attendance-calculation.service.js';
import { AttendanceQueueWorker } from './workers/attendance-queue.worker.js';
import { AttendanceService } from './services/attendance.service.js';

@Module({
  controllers: [QrAttendanceController, AttendanceController],
  providers: [
    QrSessionService,
    AttendanceCaptureService,
    AttendanceCalculationService,
    AttendanceQueueWorker,
    AttendanceService,
  ],
  exports: [
    AttendanceCaptureService,
    AttendanceCalculationService,
    AttendanceService,
  ],
})
export class AttendanceModule {}
