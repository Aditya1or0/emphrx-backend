import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AttendanceWfhRepository } from '../repositories/attendance-wfh.repository.js';
import { AttendanceSettingRepository } from '../repositories/attendance-setting.repository.js';
import { CreateWfhDto, ActionWfhDto } from '../dto/wfh.dto.js';
import { AttendanceStatus, AuditAction, RequestStatus } from '../enums/attendance.enums.js';

@Injectable()
export class WfhService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wfhRepo: AttendanceWfhRepository,
    private readonly settingsRepo: AttendanceSettingRepository,
  ) {}

  /* Submit a Work From Home request */
  async createRequest(
    orgId: string,
    employeeId: string,
    dto: CreateWfhDto,
  ) {
    const fromDate = new Date(dto.fromDate);
    const toDate = new Date(dto.toDate);

    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('fromDate cannot be after toDate');
    }

    const settings = await this.settingsRepo.findByOrgId(orgId);
    if (settings && !settings.allowWfh) {
      throw new BadRequestException('Work From Home requests are not permitted by organization policy');
    }

    return this.wfhRepo.create({
      employeeId,
      fromDate,
      toDate,
      reason: dto.reason,
      status: RequestStatus.PENDING,
    });
  }

  /* Manager/HR approves WFH request and updates daily records */
  async approveRequest(
    orgId: string,
    id: string,
    actorId: string,
    dto: ActionWfhDto,
  ) {
    const request = await this.wfhRepo.findById(id);
    if (!request || request.employee.orgId !== orgId) {
      throw new NotFoundException('WFH request not found');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot approve request that is already ${request.status}`);
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceWfhRequest.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          actionedById: actorId,
          actionReason: dto.actionReason,
          actionedAt: now,
        },
      });

      /* Reconcile each calendar date in the approved range */
      const current = new Date(request.fromDate);
      const end = new Date(request.toDate);

      while (current.getTime() <= end.getTime()) {
        const businessDate = new Date(current);
        businessDate.setUTCHours(0, 0, 0, 0);

        const existingRecord = await tx.attendanceRecord.findUnique({
          where: {
            orgId_employeeId_date: {
              orgId,
              employeeId: request.employeeId,
              date: businessDate,
            },
          },
        });

        if (existingRecord) {
          /* If record exists but employee was absent, mark as WFH */
          if (existingRecord.status === AttendanceStatus.ABSENT) {
            await tx.attendanceRecord.update({
              where: { id: existingRecord.id },
              data: { status: AttendanceStatus.WORK_FROM_HOME },
            });
          }
        } else {
          /* Create WFH record placeholder */
          await tx.attendanceRecord.create({
            data: {
              orgId,
              employeeId: request.employeeId,
              date: businessDate,
              status: AttendanceStatus.WORK_FROM_HOME,
            },
          });
        }

        current.setDate(current.getDate() + 1);
      }

      /* Log immutable audit trail */
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: 'USER',
          action: AuditAction.APPROVE,
          entityName: 'AttendanceWfhRequest',
          entityId: id,
          reason: dto.actionReason ?? 'WFH request approved',
          previousState: { status: request.status },
          newState: { status: RequestStatus.APPROVED },
        },
      });

      return updated;
    });
  }

  /* Manager/HR rejects WFH request */
  async rejectRequest(
    orgId: string,
    id: string,
    actorId: string,
    dto: ActionWfhDto,
  ) {
    const request = await this.wfhRepo.findById(id);
    if (!request || request.employee.orgId !== orgId) {
      throw new NotFoundException('WFH request not found');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot reject request that is already ${request.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceWfhRequest.update({
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
          entityName: 'AttendanceWfhRequest',
          entityId: id,
          reason: dto.actionReason ?? 'WFH request rejected',
          previousState: { status: request.status },
          newState: { status: RequestStatus.REJECTED },
        },
      });

      return updated;
    });
  }

  /* Get list of WFH requests for employee */
  async getEmployeeRequests(employeeId: string) {
    return this.wfhRepo.findManyByEmployee(employeeId);
  }
}
