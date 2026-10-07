import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceWfhRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AttendanceWfhRequestUncheckedCreateInput) {
    return this.prisma.attendanceWfhRequest.create({ data });
  }

  async findById(id: string) {
    return this.prisma.attendanceWfhRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
  }

  async update(id: string, data: Prisma.AttendanceWfhRequestUncheckedUpdateInput) {
    return this.prisma.attendanceWfhRequest.update({
      where: { id },
      data,
      include: { employee: true },
    });
  }

  async findManyByEmployee(employeeId: string) {
    return this.prisma.attendanceWfhRequest.findMany({
      where: { employeeId },
      orderBy: { fromDate: 'desc' },
    });
  }
}
