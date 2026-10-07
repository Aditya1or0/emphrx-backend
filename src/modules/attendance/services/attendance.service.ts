import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TierEntitlementService } from './tier-entitlement.service.js';
import { AttendanceQueryDto } from '../dto/attendance-query.dto.js';
import { AttendanceStatus } from '../enums/attendance.enums.js';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tierService: TierEntitlementService,
  ) {}

  /* Query paginated daily attendance records with multi-filters */
  async getAttendanceRecords(orgId: string, query: AttendanceQueryDto) {
    if (query.startDate) {
      await this.tierService.enforceHistoryRetention(orgId, query.startDate);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const whereClause: {
      orgId: string;
      date?: { gte?: Date; lte?: Date };
      employeeId?: string;
      status?: AttendanceStatus;
    } = { orgId };

    if (query.startDate || query.endDate) {
      whereClause.date = {};
      if (query.startDate) {
        whereClause.date.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        whereClause.date.lte = new Date(query.endDate);
      }
    }

    if (query.employeeId) {
      whereClause.employeeId = query.employeeId;
    }

    if (query.status) {
      whereClause.status = query.status;
    }

    const [total, records] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: whereClause }),
      this.prisma.attendanceRecord.findMany({
        where: whereClause,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: records,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /* Query detailed single-day employee attendance breakdown with all punches */
  async getEmployeeAttendanceByDate(
    orgId: string,
    employeeId: string,
    dateString: string,
  ) {
    await this.tierService.enforceHistoryRetention(orgId, dateString);

    const targetDate = new Date(dateString);
    targetDate.setUTCHours(0, 0, 0, 0);

    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        orgId_employeeId_date: {
          orgId,
          employeeId,
          date: targetDate,
        },
      },
      include: {
        employee: {
          include: {
            assignedShift: true,
          },
        },
        regularizations: true,
      },
    });

    const punches = await this.prisma.attendancePunch.findMany({
      where: {
        orgId,
        employeeId,
        businessDate: targetDate,
      },
      orderBy: { punchTime: 'asc' },
      include: {
        location: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!record && punches.length === 0) {
      throw new NotFoundException(
        `No attendance record or punches found for employee on ${dateString}`,
      );
    }

    return {
      record,
      punches,
    };
  }
}
