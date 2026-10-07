import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { RedisService } from '../../../common/redis/redis.service.js';
import { QrSessionService } from './qr/qr-session.service.js';
import { GeofenceService } from './geolocation/geofence.service.js';
import { AttendanceQueueWorker } from '../workers/attendance-queue.worker.js';
import { TierEntitlementService } from './tier-entitlement.service.js';
import { QrPunchDto } from '../dto/qr-punch.dto.js';
import { GeoPunchDto } from '../dto/geo-punch.dto.js';
import { ManualPunchDto } from '../dto/manual-punch.dto.js';
import { BiometricPunchLogDto } from '../dto/device.dto.js';
import {
  ActorRole,
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
    private readonly geofenceService: GeofenceService,
    private readonly queueWorker: AttendanceQueueWorker,
    private readonly tierService: TierEntitlementService,
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

  /* Captures mobile GPS geofenced check-in or check-out */
  async captureGeoPunch(
    orgId: string,
    employeeId: string,
    dto: GeoPunchDto,
    punchType: PunchType,
  ): Promise<PunchResult> {
    /* 0. Enforce SaaS plan tier entitlement for Geolocation */
    await this.tierService.enforceCaptureMethod(orgId, CaptureMethod.GEOLOCATION);

    /* 1. Validate coordinates against office radius via Haversine */
    const geoResult = await this.geofenceService.validateCoordinates(
      orgId,
      dto.latitude,
      dto.longitude,
      dto.accuracy,
      dto.locationId,
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

    /* 3. Acquire short Redis debounce lock */
    const lockKey = `lock:punch:${employeeId}:${dateStr}`;
    const acquired = await this.redisService.acquireLock(lockKey, 5);
    if (!acquired) {
      throw new ConflictException('A punch request is already being processed');
    }

    try {
      let flagReason: string | undefined = undefined;
      if (!geoResult.isWithinGeofence) {
        flagReason = `Punch outside geofence radius (${geoResult.distanceMeters}m from center)`;
      } else if (!geoResult.isAccuracyAcceptable) {
        flagReason = `Low accuracy GPS reading (${dto.accuracy}m)`;
      }

      /* 4. Single ACID database transaction for punch and outbox event */
      const punch = await this.prisma.$transaction(async (tx) => {
        const createdPunch = await tx.attendancePunch.create({
          data: {
            orgId,
            employeeId,
            businessDate,
            punchType,
            punchTime,
            captureMethod: CaptureMethod.GEOLOCATION,
            locationId: geoResult.location.id,
            latitude: dto.latitude,
            longitude: dto.longitude,
            gpsAccuracyMeters: dto.accuracy,
            isWithinGeofence: geoResult.isWithinGeofence,
            idempotencyKey: dto.idempotencyKey,
            isVerified: geoResult.isWithinGeofence,
            flagReason,
          },
        });

        await tx.outboxEvent.create({
          data: {
            orgId,
            eventType: 'ATTENDANCE_GEO_PUNCHED',
            aggregateId: createdPunch.id,
            status: OutboxStatus.PENDING,
            payload: {
              punchId: createdPunch.id,
              employeeId,
              businessDate: dateStr,
              punchType,
              distanceMeters: geoResult.distanceMeters,
            },
          },
        });

        return createdPunch;
      });

      /* 5. Non-blocking async queue dispatch */
      await this.queueWorker.enqueueCalculation(orgId, employeeId, businessDate);

      const statusText = punchType === PunchType.CHECK_IN ? 'Check-in' : 'Check-out';
      const fenceText = geoResult.isWithinGeofence
        ? `within ${geoResult.location.name} (${geoResult.distanceMeters}m)`
        : `outside boundary (${geoResult.distanceMeters}m)`;

      return {
        punchId: punch.id,
        punchType: punch.punchType as PunchType,
        punchTime: punch.punchTime.toISOString(),
        captureMethod: CaptureMethod.GEOLOCATION,
        businessDate: dateStr,
        message: `${statusText} recorded ${fenceText}`,
      };
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  /* Captures administrative manual attendance entry */
  async captureManualPunch(
    orgId: string,
    actorId: string,
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
          actorRole: ActorRole.USER,
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

  /* Captures batch biometric punches pushed from physical hardware terminals */
  async captureBiometricBatch(
    orgId: string,
    deviceId: string,
    logs: BiometricPunchLogDto[],
  ): Promise<{
    receivedCount: number;
    processedCount: number;
    duplicatesCount: number;
    failedLogs: Array<{ logId: string; enrollmentId: string; reason: string }>;
  }> {
    /* 0. Enforce SaaS plan tier entitlement for Biometric hardware channel */
    await this.tierService.enforceCaptureMethod(orgId, CaptureMethod.BIOMETRIC_API);

    if (!logs || logs.length === 0) {
      return {
        receivedCount: 0,
        processedCount: 0,
        duplicatesCount: 0,
        failedLogs: [],
      };
    }

    const enrollmentIds = [...new Set(logs.map((l) => l.enrollmentId))];
    const logIds = [...new Set(logs.map((l) => l.logId))];

    /* 1. Bulk lookup active employee mappings for device */
    const mappings = await this.prisma.attendanceDeviceMapping.findMany({
      where: {
        deviceId,
        biometricEnrollId: { in: enrollmentIds },
        isActive: true,
      },
      include: {
        employee: {
          include: {
            assignedShift: true,
          },
        },
      },
    });

    const mappingMap = new Map<string, (typeof mappings)[0]>();
    for (const m of mappings) {
      mappingMap.set(m.biometricEnrollId, m);
    }

    /* 2. Deduplicate against existing raw log IDs for this device */
    const existingPunches = await this.prisma.attendancePunch.findMany({
      where: {
        orgId,
        deviceId,
        rawLogId: { in: logIds },
      },
      select: { rawLogId: true },
    });

    const existingLogIds = new Set(
      existingPunches.map((p) => p.rawLogId).filter(Boolean) as string[],
    );

    const punchesToCreate: Array<{
      orgId: string;
      employeeId: string;
      businessDate: Date;
      punchType: PunchType;
      punchTime: Date;
      captureMethod: CaptureMethod;
      deviceId: string;
      rawLogId: string;
      idempotencyKey: string;
      isVerified: boolean;
      dateStr: string;
    }> = [];

    let duplicatesCount = 0;
    const failedLogs: Array<{ logId: string; enrollmentId: string; reason: string }> = [];
    const recalculationsToTrigger = new Map<string, { employeeId: string; businessDate: Date }>();

    for (const log of logs) {
      if (existingLogIds.has(log.logId)) {
        duplicatesCount++;
        continue;
      }

      const mapping = mappingMap.get(log.enrollmentId);
      if (!mapping || !mapping.employee || mapping.employee.orgId !== orgId) {
        failedLogs.push({
          logId: log.logId,
          enrollmentId: log.enrollmentId,
          reason: `Unmapped biometric enrollment ID: ${log.enrollmentId}`,
        });
        continue;
      }

      const punchTime = new Date(log.timestamp);
      if (isNaN(punchTime.getTime())) {
        failedLogs.push({
          logId: log.logId,
          enrollmentId: log.enrollmentId,
          reason: `Invalid timestamp format: ${log.timestamp}`,
        });
        continue;
      }

      const isOvernight = mapping.employee.assignedShift?.isOvernight ?? false;
      const businessDate = this.resolveBusinessDate(punchTime, isOvernight);
      const dateStr = businessDate.toISOString().split('T')[0];

      punchesToCreate.push({
        orgId,
        employeeId: mapping.employee.id,
        businessDate,
        punchType: log.punchType,
        punchTime,
        captureMethod: CaptureMethod.BIOMETRIC_API,
        deviceId,
        rawLogId: log.logId,
        idempotencyKey: `BIO:${deviceId}:${log.logId}`,
        isVerified: true,
        dateStr,
      });

      const recalcKey = `${mapping.employee.id}:${dateStr}`;
      recalculationsToTrigger.set(recalcKey, {
        employeeId: mapping.employee.id,
        businessDate,
      });
    }

    /* 3. Transactionally create punches and outbox events */
    if (punchesToCreate.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const punch of punchesToCreate) {
          const created = await tx.attendancePunch.create({
            data: {
              orgId: punch.orgId,
              employeeId: punch.employeeId,
              businessDate: punch.businessDate,
              punchType: punch.punchType,
              punchTime: punch.punchTime,
              captureMethod: punch.captureMethod,
              deviceId: punch.deviceId,
              rawLogId: punch.rawLogId,
              idempotencyKey: punch.idempotencyKey,
              isVerified: punch.isVerified,
            },
          });

          await tx.outboxEvent.create({
            data: {
              orgId: punch.orgId,
              eventType: 'ATTENDANCE_PUNCHED',
              aggregateId: created.id,
              status: OutboxStatus.PENDING,
              payload: {
                punchId: created.id,
                employeeId: punch.employeeId,
                businessDate: punch.dateStr,
                punchType: punch.punchType,
                captureMethod: CaptureMethod.BIOMETRIC_API,
              },
            },
          });
        }
      });

      /* 4. Asynchronously enqueue calculation jobs */
      for (const recalc of recalculationsToTrigger.values()) {
        await this.queueWorker.enqueueCalculation(
          orgId,
          recalc.employeeId,
          recalc.businessDate,
        );
      }
    }

    return {
      receivedCount: logs.length,
      processedCount: punchesToCreate.length,
      duplicatesCount,
      failedLogs,
    };
  }
}

