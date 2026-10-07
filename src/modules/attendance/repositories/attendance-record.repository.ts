import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUnique(orgId: string, employeeId: string, date: Date) {
    return this.prisma.attendanceRecord.findUnique({
      where: {
        orgId_employeeId_date: {
          orgId,
          employeeId,
          date,
        },
      },
      include: {
        employee: {
          include: { assignedShift: true },
        },
        regularizations: true,
      },
    });
  }

  async upsert(
    orgId: string,
    employeeId: string,
    date: Date,
    createData: Prisma.AttendanceRecordUncheckedCreateInput,
    updateData: Prisma.AttendanceRecordUncheckedUpdateInput,
  ) {
    return this.prisma.attendanceRecord.upsert({
      where: {
        orgId_employeeId_date: {
          orgId,
          employeeId,
          date,
        },
      },
      create: createData,
      update: updateData,
    });
  }

  async findManyWithPagination(
    whereClause: Prisma.AttendanceRecordWhereInput,
    skip: number,
    take: number,
  ) {
    return Promise.all([
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
        take,
      }),
    ]);
  }
}
