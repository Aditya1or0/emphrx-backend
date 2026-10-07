import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceLocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.attendanceLocation.findUnique({
      where: { id },
    });
  }

  async findByCode(orgId: string, code: string) {
    return this.prisma.attendanceLocation.findUnique({
      where: {
        orgId_code: { orgId, code },
      },
    });
  }

  async findActiveLocationsByOrg(orgId: string) {
    return this.prisma.attendanceLocation.findMany({
      where: { orgId, isActive: true },
    });
  }

  async create(data: Prisma.AttendanceLocationUncheckedCreateInput) {
    return this.prisma.attendanceLocation.create({ data });
  }
}
