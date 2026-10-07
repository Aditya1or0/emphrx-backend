import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TierEntitlementService } from './tier-entitlement.service.js';
import { AttendanceAnalyticsQueryDto } from '../dto/analytics-export.dto.js';
import { AttendanceStatus } from '../enums/attendance.enums.js';

@Injectable()
export class AttendanceAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tierService: TierEntitlementService,
  ) {}

  /* Computes organizational attendance health, trends, and aggregate metrics */
  async getOverview(orgId: string, query: AttendanceAnalyticsQueryDto) {
    const today = new Date();
    const defaultStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

    const startDate = query.startDate ? new Date(query.startDate) : defaultStart;
    const endDate = query.endDate ? new Date(query.endDate) : defaultEnd;
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    /* Enforce historical query retention limits according to SaaS subscription tier */
    await this.tierService.enforceHistoryRetention(orgId, startDate);

    /* Fetch daily records in date range */
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        orgId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const totalRecords = records.length;
    let presentCount = 0;
    let absentCount = 0;
    let halfDayCount = 0;
    let wfhCount = 0;
    let leaveCount = 0;
    let totalLateOccurrences = 0;
    let totalEarlyExitOccurrences = 0;
    let totalOvertimeMinutes = 0;
    let totalWorkMinutes = 0;

    const trendMap = new Map<
      string,
      {
        date: string;
        present: number;
        absent: number;
        halfDay: number;
        wfh: number;
        late: number;
      }
    >();

    for (const r of records) {
      const dateKey = r.date.toISOString().split('T')[0];
      if (!trendMap.has(dateKey)) {
        trendMap.set(dateKey, {
          date: dateKey,
          present: 0,
          absent: 0,
          halfDay: 0,
          wfh: 0,
          late: 0,
        });
      }
      const dayData = trendMap.get(dateKey)!;

      if (r.status === AttendanceStatus.PRESENT) {
        presentCount++;
        dayData.present++;
      } else if (r.status === AttendanceStatus.ABSENT) {
        absentCount++;
        dayData.absent++;
      } else if (r.status === AttendanceStatus.HALF_DAY) {
        halfDayCount++;
        dayData.halfDay++;
      } else if (r.status === AttendanceStatus.WORK_FROM_HOME) {
        wfhCount++;
        dayData.wfh++;
      } else if (r.status === AttendanceStatus.ON_LEAVE) {
        leaveCount++;
      }

      if (r.lateMinutes > 0) {
        totalLateOccurrences++;
        dayData.late++;
      }
      if (r.earlyExitMinutes > 0) {
        totalEarlyExitOccurrences++;
      }

      totalOvertimeMinutes += r.overtimeMinutes || 0;
      totalWorkMinutes += r.totalWorkMinutes || 0;
    }

    const averagePresentPercentage =
      totalRecords > 0
        ? Number(((presentCount / totalRecords) * 100).toFixed(1))
        : 0;

    const totalOvertimeHours = Number((totalOvertimeMinutes / 60).toFixed(1));
    const totalWorkHours = Number((totalWorkMinutes / 60).toFixed(1));

    return {
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      metrics: {
        totalRecords,
        averagePresentPercentage,
        totalLateOccurrences,
        totalEarlyExitOccurrences,
        totalOvertimeHours,
        totalWfhDays: wfhCount,
        totalWorkHours,
      },
      breakdown: {
        present: presentCount,
        absent: absentCount,
        halfDay: halfDayCount,
        workFromHome: wfhCount,
        onLeave: leaveCount,
      },
      dailyTrend: Array.from(trendMap.values()),
    };
  }
}
