import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendancePunchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AttendancePunchUncheckedCreateInput) {
    return this.prisma.attendancePunch.create({ data });
  }

  async findManyByDate(orgId: string, employeeId: string, businessDate: Date) {
    return this.prisma.attendancePunch.findMany({
      where: {
        orgId,
        employeeId,
        businessDate,
      },
      orderBy: { punchTime: 'asc' },
      include: { location: true },
    });
  }

  async findById(id: string) {
    return this.prisma.attendancePunch.findUnique({
      where: { id },
      include: { location: true, employee: true },
    });
  }
}
