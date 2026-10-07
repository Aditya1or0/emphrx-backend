import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TierEntitlementService } from './tier-entitlement.service.js';
import { AttendanceExportQueryDto } from '../dto/analytics-export.dto.js';

@Injectable()
export class AttendanceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tierService: TierEntitlementService,
  ) {}

  /* Escapes field for CSV safety against delimiters and quotes */
  private escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) {
      return '';
    }
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /* Generates streaming CSV timesheet report */
  async generateTimesheetCsv(orgId: string, query: AttendanceExportQueryDto) {
    const today = new Date();
    const defaultStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

    const startDate = query.startDate ? new Date(query.startDate) : defaultStart;
    const endDate = query.endDate ? new Date(query.endDate) : defaultEnd;
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    /* Enforce plan retention limits */
    await this.tierService.enforceHistoryRetention(orgId, startDate);

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        orgId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { employee: { employeeCode: 'asc' } },
      ],
    });

    const headers = [
      'Employee Code',
      'First Name',
      'Last Name',
      'Email',
      'Date',
      'Shift Code',
      'First Check-In',
      'Last Check-Out',
      'Total Punches',
      'Work Minutes',
      'Late Minutes',
      'Early Exit Minutes',
      'Overtime Minutes',
      'Status',
      'Regularized',
      'Notes',
    ];

    const rows: string[] = [headers.join(',')];

    for (const r of records) {
      const row = [
        this.escapeCsvField(r.employee?.employeeCode ?? ''),
        this.escapeCsvField(r.employee?.firstName ?? ''),
        this.escapeCsvField(r.employee?.lastName ?? ''),
        this.escapeCsvField(r.employee?.email ?? ''),
        this.escapeCsvField(r.date.toISOString().split('T')[0]),
        this.escapeCsvField(r.snapshotShiftCode ?? ''),
        this.escapeCsvField(r.firstCheckIn ? r.firstCheckIn.toISOString() : ''),
        this.escapeCsvField(r.lastCheckOut ? r.lastCheckOut.toISOString() : ''),
        this.escapeCsvField(r.totalPunches),
        this.escapeCsvField(r.totalWorkMinutes),
        this.escapeCsvField(r.lateMinutes),
        this.escapeCsvField(r.earlyExitMinutes),
        this.escapeCsvField(r.overtimeMinutes),
        this.escapeCsvField(r.status),
        this.escapeCsvField(r.isRegularized ? 'YES' : 'NO'),
        this.escapeCsvField(r.notes ?? ''),
      ];
      rows.push(row.join(','));
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const filename = `attendance_timesheet_${startStr}_to_${endStr}.csv`;

    return {
      csvContent: rows.join('\r\n'),
      filename,
      recordCount: records.length,
    };
  }
}
