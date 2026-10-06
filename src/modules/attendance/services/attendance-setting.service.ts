import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AttendanceSettingRepository } from '../repositories/attendance-setting.repository.js';
import { UpdateAttendanceSettingDto } from '../dto/attendance-setting.dto.js';
import { AuditAction } from '../enums/attendance.enums.js';

@Injectable()
export class AttendanceSettingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsRepo: AttendanceSettingRepository,
  ) {}

  /* Fetch current attendance rules and settings for organization */
  async getSettings(orgId: string) {
    const existing = await this.settingsRepo.findByOrgId(orgId);
    if (existing) {
      return existing;
    }

    /* Provision default settings if not already present */
    return this.settingsRepo.upsert(
      orgId,
      {
        orgId,
        defaultWorkHoursMinutes: 480,
        defaultHalfDayMinutes: 240,
        graceMinutes: 15,
        lateMarkAfterMinutes: 15,
        earlyExitBeforeMinutes: 15,
        overtimeThresholdMinutes: 60,
        punchCooldownSeconds: 60,
        maxRegularizationDays: 7,
        weeklyOffDays: ['SATURDAY', 'SUNDAY'],
        allowWfh: true,
        requireGeoForQr: false,
      },
      {},
    );
  }

  /* Update organization attendance parameters with full audit logging */
  async updateSettings(
    orgId: string,
    actorId: string,
    dto: UpdateAttendanceSettingDto,
  ) {
    const existing = await this.getSettings(orgId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.attendanceSetting.upsert({
        where: { orgId },
        create: {
          orgId,
          ...dto,
        },
        update: {
          ...dto,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: 'USER',
          action: AuditAction.UPDATE,
          entityName: 'AttendanceSetting',
          entityId: result.id,
          reason: 'Organization attendance policy updated',
          previousState: existing ? (existing as unknown as object) : undefined,
          newState: dto as unknown as object,
        },
      });

      return result;
    });

    return updated;
  }
}
