import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { DeviceStatus, Prisma } from '@prisma/client';

@Injectable()
export class AttendanceDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* Create new physical biometric device record */
  async create(data: Prisma.AttendanceDeviceCreateInput) {
    return this.prisma.attendanceDevice.create({ data });
  }

  /* Find device by primary key UUID */
  async findById(id: string) {
    return this.prisma.attendanceDevice.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /* Find device by organization ID and hardware serial number */
  async findBySerial(orgId: string, serialNumber: string) {
    return this.prisma.attendanceDevice.findUnique({
      where: {
        orgId_serialNumber: {
          orgId,
          serialNumber,
        },
      },
    });
  }

  /* Find device globally across tenants by serial number */
  async findBySerialGlobal(serialNumber: string) {
    return this.prisma.attendanceDevice.findFirst({
      where: { serialNumber },
      include: {
        organization: true,
      },
    });
  }

  /* List all biometric devices registered under tenant organization */
  async findByOrgId(orgId: string) {
    return this.prisma.attendanceDevice.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { mappings: true, punches: true },
        },
      },
    });
  }

  /* Update device metadata, status, or heartbeat */
  async update(id: string, data: Prisma.AttendanceDeviceUpdateInput) {
    return this.prisma.attendanceDevice.update({
      where: { id },
      data,
    });
  }

  /* Delete device record */
  async delete(id: string) {
    return this.prisma.attendanceDevice.delete({
      where: { id },
    });
  }

  /* Update device heartbeat timestamp and status */
  async updateHeartbeat(id: string, status?: DeviceStatus, ipAddress?: string) {
    return this.prisma.attendanceDevice.update({
      where: { id },
      data: {
        lastHeartbeatAt: new Date(),
        ...(status ? { status } : { status: DeviceStatus.ONLINE }),
        ...(ipAddress ? { ipAddress } : {}),
      },
    });
  }

  /* Create employee biometric enrollment mapping */
  async createMapping(deviceId: string, employeeId: string, biometricEnrollId: string) {
    return this.prisma.attendanceDeviceMapping.create({
      data: {
        deviceId,
        employeeId,
        biometricEnrollId,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /* Find mapping by device and enrollment ID */
  async findMappingByEnrollId(deviceId: string, biometricEnrollId: string) {
    return this.prisma.attendanceDeviceMapping.findUnique({
      where: {
        deviceId_biometricEnrollId: {
          deviceId,
          biometricEnrollId,
        },
      },
      include: {
        employee: true,
      },
    });
  }

  /* Batch query mappings for device matching list of enrollment IDs */
  async findMappingsByEnrollIds(deviceId: string, biometricEnrollIds: string[]) {
    return this.prisma.attendanceDeviceMapping.findMany({
      where: {
        deviceId,
        biometricEnrollId: { in: biometricEnrollIds },
        isActive: true,
      },
      include: {
        employee: {
          include: {
            assignedShift: true,
          },
        },
      },
    });
  }

  /* List all employee mappings configured for specific device */
  async findMappingsForDevice(deviceId: string) {
    return this.prisma.attendanceDeviceMapping.findMany({
      where: { deviceId },
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
      orderBy: { createdAt: 'desc' },
    });
  }

  /* Delete employee mapping */
  async deleteMapping(id: string) {
    return this.prisma.attendanceDeviceMapping.delete({
      where: { id },
    });
  }
}
