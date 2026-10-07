import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceSettingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrgId(orgId: string) {
    return this.prisma.attendanceSetting.findUnique({
      where: { orgId },
      include: {
        organization: {
          include: { holidays: true },
        },
      },
    });
  }

  async upsert(
    orgId: string,
    createData: Prisma.AttendanceSettingUncheckedCreateInput,
    updateData: Prisma.AttendanceSettingUncheckedUpdateInput,
  ) {
    return this.prisma.attendanceSetting.upsert({
      where: { orgId },
      create: createData,
      update: updateData,
    });
  }
}
