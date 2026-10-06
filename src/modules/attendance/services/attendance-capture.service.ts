import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { RedisService } from '../../../common/redis/redis.service.js';
import { QrSessionService } from './qr/qr-session.service.js';
import { AttendanceQueueWorker } from '../workers/attendance-queue.worker.js';
import { QrPunchDto } from '../dto/qr-punch.dto.js';
import { ManualPunchDto } from '../dto/manual-punch.dto.js';
import {
  AuditAction,
  CaptureMethod,
  OutboxStatus,
  PunchType,
} from '../enums/attendance.enums.js';

export interface PunchResult {
  punchId: string;
  punchType: PunchType;
  punchTime: string;
  captureMethod: CaptureMethod;
  businessDate: string;
  message: string;
}

@Injectable()
export class AttendanceCaptureService {
  private readonly logger = new Logger(AttendanceCaptureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly qrSessionService: QrSessionService,
    private readonly queueWorker: AttendanceQueueWorker,
  ) {}

  /* Resolves the logical business attendance date for an employee */
  private resolveBusinessDate(
    punchTime: Date,
    isOvernightShift: boolean,
  ): Date {
    const businessDate = new Date(punchTime);
    businessDate.setUTCHours(0, 0, 0, 0);

    if (isOvernightShift) {
      const hour = punchTime.getUTCHours();
      /* Punches between midnight and 12:00 PM belong to previous calendar day's night shift */
      if (hour < 12) {
        businessDate.setUTCDate(businessDate.getUTCDate() - 1);
      }
    }

    return businessDate;
  }

  /* Captures mobile dynamic QR code check-in or check-out */
  async captureQrPunch(
    orgId: string,
    employeeId: string,
    dto: QrPunchDto,
    punchType: PunchType,
  ): Promise<PunchResult> {
    /* 1. Atomically validate and consume QR session token from Redis */
    const qrPayload = await this.qrSessionService.validateAndConsumeToken(
      orgId,
      dto.qrToken,
    );

    const punchTime = new Date();

    /* 2. Retrieve employee and assigned shift */
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { assignedShift: true },
    });

    if (!employee || employee.orgId !== orgId) {
      throw new BadRequestException('Employee not found or unassociated with tenant');
    }

    const businessDate = this.resolveBusinessDate(
      punchTime,
      employee.assignedShift?.isOvernight ?? false,
    );
    const dateStr = businessDate.toISOString().split('T')[0];

    /* 3. Acquire short Redis debounce lock to prevent accidental double-tap */
    const lockKey = `lock:punch:${employeeId}:${dateStr}`;
    const acquired = await this.redisService.acquireLock(lockKey, 5);
    if (!acquired) {
      throw new ConflictException('A punch request is already being processed');
    }

    try {
      /* 4. Single ACID database transaction for punch and outbox event */
      const punch = await this.prisma.$transaction(async (tx) => {
        const createdPunch = await tx.attendancePunch.create({
          data: {
            orgId,
            employeeId,
            businessDate,
            punchType,
            punchTime,
            captureMethod: CaptureMethod.QR_CODE,
            locationId: qrPayload.locationId,
            latitude: dto.latitude,
            longitude: dto.longitude,
            gpsAccuracyMeters: dto.gpsAccuracyMeters,
            isWithinGeofence: true,
            deviceId: dto.deviceId,
            idempotencyKey: dto.idempotencyKey,
            isVerified: true,
          },
        });

        await tx.outboxEvent.create({
          data: {
            orgId,
            eventType: 'ATTENDANCE_PUNCHED',
            aggregateId: createdPunch.id,
            status: OutboxStatus.PENDING,
            payload: {
              punchId: createdPunch.id,
              employeeId,
              businessDate: dateStr,
              punchType,
            },
          },
        });

        return createdPunch;
      });

      /* 5. Non-blocking async queue dispatch */
      await this.queueWorker.enqueueCalculation(orgId, employeeId, businessDate);

      return {
        punchId: punch.id,
        punchType: punch.punchType as PunchType,
        punchTime: punch.punchTime.toISOString(),
        captureMethod: CaptureMethod.QR_CODE,
        businessDate: dateStr,
        message: `${punchType === PunchType.CHECK_IN ? 'Check-in' : 'Check-out'} recorded successfully`,
      };
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  /* Captures administrative manual attendance entry */
  async captureManualPunch(
    orgId: string,
    actorId: string,
    actorRole: string,
    dto: ManualPunchDto,
  ): Promise<PunchResult> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      include: { assignedShift: true },
    });

    if (!employee || employee.orgId !== orgId) {
      throw new BadRequestException('Employee not found in organization');
    }

    const punchTime = new Date(dto.punchTime);
    const businessDate = this.resolveBusinessDate(
      punchTime,
      employee.assignedShift?.isOvernight ?? false,
    );
    const dateStr = businessDate.toISOString().split('T')[0];

    const punch = await this.prisma.$transaction(async (tx) => {
      const createdPunch = await tx.attendancePunch.create({
        data: {
          orgId,
          employeeId: dto.employeeId,
          businessDate,
          punchType: dto.punchType,
          punchTime,
          captureMethod: CaptureMethod.MANUAL_ADMIN,
          locationId: dto.locationId,
          idempotencyKey: dto.idempotencyKey,
          isVerified: true,
          flagReason: `Manual entry: ${dto.reason}`,
        },
      });

      /* Record immutable audit log entry */
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole,
          action: AuditAction.CREATE,
          entityName: 'AttendancePunch',
          entityId: createdPunch.id,
          reason: dto.reason,
          newState: {
            punchType: dto.punchType,
            punchTime: dto.punchTime,
            employeeId: dto.employeeId,
          },
        },
      });

      /* Append transactional outbox event */
      await tx.outboxEvent.create({
        data: {
          orgId,
          eventType: 'ATTENDANCE_MANUAL_PUNCHED',
          aggregateId: createdPunch.id,
          status: OutboxStatus.PENDING,
          payload: {
            punchId: createdPunch.id,
            employeeId: dto.employeeId,
            businessDate: dateStr,
            punchType: dto.punchType,
          },
        },
      });

      return createdPunch;
    });

    /* Non-blocking async queue dispatch */
    await this.queueWorker.enqueueCalculation(
      orgId,
      dto.employeeId,
      businessDate,
    );

    return {
      punchId: punch.id,
      punchType: punch.punchType as PunchType,
      punchTime: punch.punchTime.toISOString(),
      captureMethod: CaptureMethod.MANUAL_ADMIN,
      businessDate: dateStr,
      message: 'Manual punch recorded successfully',
    };
  }
}
