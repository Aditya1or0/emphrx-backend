import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AttendanceRegularizationRepository } from '../repositories/attendance-regularization.repository.js';
import { AttendanceRecordRepository } from '../repositories/attendance-record.repository.js';
import { AttendanceSettingRepository } from '../repositories/attendance-setting.repository.js';
import { AttendanceQueueWorker } from '../workers/attendance-queue.worker.js';
import { CreateRegularizationDto, ActionRegularizationDto } from '../dto/regularization.dto.js';
import { AuditAction, RequestStatus } from '../enums/attendance.enums.js';

@Injectable()
export class RegularizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly regularizationRepo: AttendanceRegularizationRepository,
    private readonly recordRepo: AttendanceRecordRepository,
    private readonly settingsRepo: AttendanceSettingRepository,
    private readonly queueWorker: AttendanceQueueWorker,
  ) {}

  /* Submit a missed punch correction request */
  async createRequest(
    orgId: string,
    employeeId: string,
    dto: CreateRegularizationDto,
  ) {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { id: dto.recordId },
    });

    if (!record || record.orgId !== orgId || record.employeeId !== employeeId) {
      throw new NotFoundException('Attendance record not found for this employee');
    }

    /* Enforce max regularization historical window from organization settings */
    const settings = await this.settingsRepo.findByOrgId(orgId);
    const maxDays = settings?.maxRegularizationDays ?? 7;
    const oldestAllowedDate = new Date();
    oldestAllowedDate.setDate(oldestAllowedDate.getDate() - maxDays);

    if (record.date.getTime() < oldestAllowedDate.getTime()) {
      throw new BadRequestException(
        `Cannot regularize attendance older than ${maxDays} days`,
      );
    }

    /* Prevent duplicate pending regularization requests for same record */
    const existingPending = await this.prisma.attendanceRegularization.findFirst({
      where: {
        recordId: dto.recordId,
        status: RequestStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new BadRequestException('A pending regularization already exists for this date');
    }

    return this.regularizationRepo.create({
      recordId: dto.recordId,
      employeeId,
      requestedCheckIn: dto.requestedCheckIn ? new Date(dto.requestedCheckIn) : undefined,
      requestedCheckOut: dto.requestedCheckOut ? new Date(dto.requestedCheckOut) : undefined,
      reason: dto.reason,
      status: RequestStatus.PENDING,
    });
  }

  /* Manager/HR approves regularization */
  async approveRequest(
    orgId: string,
    id: string,
    actorId: string,
    dto: ActionRegularizationDto,
  ) {
    const reg = await this.regularizationRepo.findById(id);
    if (!reg || reg.record.orgId !== orgId) {
      throw new NotFoundException('Regularization request not found');
    }

    if (reg.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot approve request that is already ${reg.status}`);
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.attendanceRegularization.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          actionedById: actorId,
          actionReason: dto.actionReason,
          actionedAt: now,
        },
      });

      /* Mark daily attendance record as regularized */
      await tx.attendanceRecord.update({
        where: { id: reg.recordId },
        data: {
          isRegularized: true,
          firstCheckIn: reg.requestedCheckIn ?? reg.record.firstCheckIn,
          lastCheckOut: reg.requestedCheckOut ?? reg.record.lastCheckOut,
        },
      });

      /* Log immutable audit trail */
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: 'USER',
          action: AuditAction.APPROVE,
          entityName: 'AttendanceRegularization',
          entityId: id,
          reason: dto.actionReason ?? 'Regularization approved',
          previousState: { status: reg.status },
          newState: { status: RequestStatus.APPROVED },
        },
      });

      return result;
    });

    /* Enqueue async recalculation to refresh work duration and late status */
    await this.queueWorker.enqueueCalculation(
      orgId,
      reg.employeeId,
      reg.record.date,
    );

    return updated;
  }

  /* Manager/HR rejects regularization */
  async rejectRequest(
    orgId: string,
    id: string,
    actorId: string,
    dto: ActionRegularizationDto,
  ) {
    const reg = await this.regularizationRepo.findById(id);
    if (!reg || reg.record.orgId !== orgId) {
      throw new NotFoundException('Regularization request not found');
    }

    if (reg.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot reject request that is already ${reg.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.attendanceRegularization.update({
        where: { id },
        data: {
          status: RequestStatus.REJECTED,
          actionedById: actorId,
          actionReason: dto.actionReason,
          actionedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: 'USER',
          action: AuditAction.REJECT,
          entityName: 'AttendanceRegularization',
          entityId: id,
          reason: dto.actionReason ?? 'Regularization rejected',
          previousState: { status: reg.status },
          newState: { status: RequestStatus.REJECTED },
        },
      });

      return result;
    });
  }

  /* Get list of regularizations for employee */
  async getEmployeeRequests(employeeId: string) {
    return this.regularizationRepo.findManyByEmployee(employeeId);
  }
}
