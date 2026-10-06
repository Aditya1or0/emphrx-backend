import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceRegularizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AttendanceRegularizationUncheckedCreateInput) {
    return this.prisma.attendanceRegularization.create({ data });
  }

  async findById(id: string) {
    return this.prisma.attendanceRegularization.findUnique({
      where: { id },
      include: {
        record: true,
        employee: true,
      },
    });
  }

  async update(id: string, data: Prisma.AttendanceRegularizationUncheckedUpdateInput) {
    return this.prisma.attendanceRegularization.update({
      where: { id },
      data,
      include: {
        record: true,
        employee: true,
      },
    });
  }

  async findManyByEmployee(employeeId: string) {
    return this.prisma.attendanceRegularization.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      include: { record: true },
    });
  }
}
