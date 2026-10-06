import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AttendanceStatus, PunchType } from '../enums/attendance.enums.js';

@Injectable()
export class AttendanceCalculationService {
  private readonly logger = new Logger(AttendanceCalculationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* Recalculates daily attendance rollup for employee on businessDate */
  async recalculateDay(
    orgId: string,
    employeeId: string,
    businessDate: Date,
  ): Promise<void> {
    const startOfTargetDate = new Date(businessDate);
    startOfTargetDate.setUTCHours(0, 0, 0, 0);

    /* 1. Fetch employee with assigned shift and org settings */
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        assignedShift: true,
        organization: {
          include: {
            attendanceSettings: true,
          },
        },
      },
    });

    if (!employee || employee.orgId !== orgId) {
      this.logger.warn(`Employee ${employeeId} not found in org ${orgId}`);
      return;
    }

    const settings = employee.organization.attendanceSettings;
    const shift = employee.assignedShift;

    /* 2. Fetch all chronological punches for this business date */
    const punches = await this.prisma.attendancePunch.findMany({
      where: {
        orgId,
        employeeId,
        businessDate: startOfTargetDate,
      },
      orderBy: {
        punchTime: 'asc',
      },
    });

    /* 3. Retrieve or prepare snapshot shift values */
    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        orgId_employeeId_date: {
          orgId,
          employeeId,
          date: startOfTargetDate,
        },
      },
    });

    const snapshotShiftCode =
      existingRecord?.snapshotShiftCode ?? shift?.code ?? 'DEFAULT';
    const snapshotStartTime =
      existingRecord?.snapshotStartTime ?? shift?.startTime ?? '09:00';
    const snapshotEndTime =
      existingRecord?.snapshotEndTime ?? shift?.endTime ?? '18:00';
    const snapshotFullDayMins =
      existingRecord?.snapshotFullDayMins ??
      settings?.defaultWorkHoursMinutes ??
      480;
    const snapshotHalfDayMins =
      existingRecord?.snapshotHalfDayMins ??
      settings?.defaultHalfDayMinutes ??
      240;
    const snapshotGraceMins =
      existingRecord?.snapshotGraceMins ?? settings?.graceMinutes ?? 15;

    /* 4. Calculate punch pairing and work minutes */
    let firstCheckIn: Date | null = null;
    let lastCheckOut: Date | null = null;
    let totalWorkMinutes = 0;
    let currentInTime: Date | null = null;

    for (const punch of punches) {
      if (punch.punchType === PunchType.CHECK_IN) {
        if (!firstCheckIn) {
          firstCheckIn = punch.punchTime;
        }
        currentInTime = punch.punchTime;
      } else if (punch.punchType === PunchType.CHECK_OUT) {
        lastCheckOut = punch.punchTime;
        if (currentInTime) {
          const diffMs = punch.punchTime.getTime() - currentInTime.getTime();
          const segmentMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
          totalWorkMinutes += segmentMinutes;
          currentInTime = null;
        }
      }
    }

    /* 5. Calculate late arrival minutes */
    let lateMinutes = 0;
    if (firstCheckIn) {
      const [expectedHour, expectedMinute] = snapshotStartTime
        .split(':')
        .map(Number);
      const shiftStartThreshold = new Date(firstCheckIn);
      shiftStartThreshold.setUTCHours(
        expectedHour,
        expectedMinute + snapshotGraceMins,
        0,
        0,
      );

      if (firstCheckIn.getTime() > shiftStartThreshold.getTime()) {
        const lateDiffMs = firstCheckIn.getTime() - shiftStartThreshold.getTime();
        lateMinutes = Math.floor(lateDiffMs / (1000 * 60));
      }
    }

    /* 6. Calculate early exit minutes */
    let earlyExitMinutes = 0;
    if (lastCheckOut) {
      const [expectedEndHour, expectedEndMinute] = snapshotEndTime
        .split(':')
        .map(Number);
      const shiftEndTime = new Date(lastCheckOut);
      shiftEndTime.setUTCHours(expectedEndHour, expectedEndMinute, 0, 0);

      if (lastCheckOut.getTime() < shiftEndTime.getTime()) {
        const earlyDiffMs = shiftEndTime.getTime() - lastCheckOut.getTime();
        earlyExitMinutes = Math.floor(earlyDiffMs / (1000 * 60));
      }
    }

    /* 7. Evaluate Overtime */
    const overtimeThreshold = settings?.overtimeThresholdMinutes ?? 60;
    let overtimeMinutes = 0;
    const excessMinutes = totalWorkMinutes - snapshotFullDayMins;
    if (excessMinutes >= overtimeThreshold) {
      overtimeMinutes = excessMinutes;
    }

    /* 8. Determine Status */
    let status: AttendanceStatus = AttendanceStatus.ABSENT;
    if (totalWorkMinutes >= snapshotFullDayMins) {
      status = AttendanceStatus.PRESENT;
    } else if (totalWorkMinutes >= snapshotHalfDayMins) {
      status = AttendanceStatus.HALF_DAY;
    } else if (punches.length > 0) {
      /* In-progress punch or deficient hours */
      status = AttendanceStatus.PRESENT;
    }

    /* 9. Atomic Upsert of Materialized Record */
    await this.prisma.attendanceRecord.upsert({
      where: {
        orgId_employeeId_date: {
          orgId,
          employeeId,
          date: startOfTargetDate,
        },
      },
      create: {
        orgId,
        employeeId,
        date: startOfTargetDate,
        firstCheckIn,
        lastCheckOut,
        totalPunches: punches.length,
        totalWorkMinutes,
        effectiveWorkMinutes: totalWorkMinutes,
        lateMinutes,
        earlyExitMinutes,
        overtimeMinutes,
        status,
        snapshotShiftCode,
        snapshotStartTime,
        snapshotEndTime,
        snapshotFullDayMins,
        snapshotHalfDayMins,
        snapshotGraceMins,
      },
      update: {
        firstCheckIn,
        lastCheckOut,
        totalPunches: punches.length,
        totalWorkMinutes,
        effectiveWorkMinutes: totalWorkMinutes,
        lateMinutes,
        earlyExitMinutes,
        overtimeMinutes,
        status,
      },
    });

    this.logger.debug(
      `Recalculated attendance record for employee ${employeeId} on ${startOfTargetDate.toISOString()} with status ${status}`,
    );
  }
}
