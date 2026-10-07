import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service.js';
import { AttendanceDeviceRepository } from '../repositories/attendance-device.repository.js';
import { AttendanceCaptureService } from './attendance-capture.service.js';
import {
  RegisterDeviceDto,
  UpdateDeviceDto,
  CreateDeviceMappingDto,
  DeviceHeartbeatDto,
  BiometricPunchBatchDto,
} from '../dto/device.dto.js';
import {
  ActorRole,
  AuditAction,
  DeviceStatus,
} from '../enums/attendance.enums.js';

@Injectable()
export class AttendanceDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceRepo: AttendanceDeviceRepository,
    private readonly captureService: AttendanceCaptureService,
  ) {}

  /* Registers new physical biometric terminal and generates secure API key */
  async registerDevice(
    orgId: string,
    actorId: string,
    dto: RegisterDeviceDto,
  ) {
    const existing = await this.deviceRepo.findBySerial(orgId, dto.serialNumber);
    if (existing) {
      throw new ConflictException(
        `Device with serial number ${dto.serialNumber} is already registered in this organization`,
      );
    }

    /* Generate cryptographically secure API key and its SHA-256 hash */
    const rawApiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(rawApiKey)
      .digest('hex');

    const device = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attendanceDevice.create({
        data: {
          orgId,
          name: dto.name,
          serialNumber: dto.serialNumber,
          deviceType: dto.deviceType,
          ipAddress: dto.ipAddress,
          apiKeyHash,
          status: DeviceStatus.ONLINE,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: ActorRole.USER,
          action: AuditAction.CREATE,
          entityName: 'AttendanceDevice',
          entityId: created.id,
          reason: `Biometric terminal ${dto.name} (${dto.serialNumber}) registered`,
          newState: {
            name: created.name,
            serialNumber: created.serialNumber,
            deviceType: created.deviceType,
          },
        },
      });

      return created;
    });

    return {
      id: device.id,
      name: device.name,
      serialNumber: device.serialNumber,
      deviceType: device.deviceType,
      ipAddress: device.ipAddress,
      status: device.status,
      apiKey: rawApiKey,
      createdAt: device.createdAt,
    };
  }

  /* List all physical terminals registered for organization */
  async listDevices(orgId: string) {
    return this.deviceRepo.findByOrgId(orgId);
  }

  /* Get single physical device by UUID */
  async getDevice(orgId: string, id: string) {
    const device = await this.deviceRepo.findById(id);
    if (!device || device.orgId !== orgId) {
      throw new NotFoundException(`Biometric terminal with ID ${id} not found`);
    }
    return device;
  }

  /* Update terminal metadata or operational status */
  async updateDevice(
    orgId: string,
    id: string,
    actorId: string,
    dto: UpdateDeviceDto,
  ) {
    const existing = await this.getDevice(orgId, id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceDevice.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.deviceType ? { deviceType: dto.deviceType } : {}),
          ...(dto.ipAddress ? { ipAddress: dto.ipAddress } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: ActorRole.USER,
          action: AuditAction.UPDATE,
          entityName: 'AttendanceDevice',
          entityId: id,
          reason: `Device ${existing.serialNumber} parameters updated`,
          previousState: {
            name: existing.name,
            status: existing.status,
            deviceType: existing.deviceType,
          },
          newState: dto as unknown as object,
        },
      });

      return updated;
    });
  }

  /* Decommission or delete terminal record */
  async deleteDevice(orgId: string, id: string, actorId: string) {
    const existing = await this.getDevice(orgId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceDevice.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: ActorRole.USER,
          action: AuditAction.DELETE,
          entityName: 'AttendanceDevice',
          entityId: id,
          reason: `Device ${existing.serialNumber} removed from system`,
        },
      });
    });

    return { message: `Device ${existing.serialNumber} deleted successfully` };
  }

  /* Process periodic hardware heartbeat ping */
  async recordHeartbeat(serialNumber: string, dto?: DeviceHeartbeatDto) {
    const device = await this.deviceRepo.findBySerialGlobal(serialNumber);
    if (!device) {
      throw new NotFoundException(
        `Hardware device with serial ${serialNumber} not found`,
      );
    }

    if (device.status === DeviceStatus.DECOMMISSIONED) {
      throw new BadRequestException(
        `Device ${serialNumber} is decommissioned and cannot send heartbeats`,
      );
    }

    return this.deviceRepo.updateHeartbeat(
      device.id,
      dto?.status ?? DeviceStatus.ONLINE,
      dto?.ipAddress,
    );
  }

  /* Maps employee to biometric enrollment ID on device */
  async createMapping(
    orgId: string,
    deviceId: string,
    actorId: string,
    dto: CreateDeviceMappingDto,
  ) {
    await this.getDevice(orgId, deviceId);

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee || employee.orgId !== orgId) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found in this organization`);
    }

    const existingMapping = await this.deviceRepo.findMappingByEnrollId(
      deviceId,
      dto.biometricEnrollId,
    );
    if (existingMapping) {
      throw new ConflictException(
        `Enrollment ID ${dto.biometricEnrollId} is already mapped to employee ${existingMapping.employeeId} on this device`,
      );
    }

    const mapping = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attendanceDeviceMapping.create({
        data: {
          deviceId,
          employeeId: dto.employeeId,
          biometricEnrollId: dto.biometricEnrollId,
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

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: ActorRole.USER,
          action: AuditAction.CREATE,
          entityName: 'AttendanceDeviceMapping',
          entityId: created.id,
          reason: `Mapped employee ${employee.employeeCode} to biometric enroll ID ${dto.biometricEnrollId}`,
        },
      });

      return created;
    });

    return mapping;
  }

  /* List employee enrollment mappings for specific terminal */
  async listMappings(orgId: string, deviceId: string) {
    await this.getDevice(orgId, deviceId);
    return this.deviceRepo.findMappingsForDevice(deviceId);
  }

  /* Remove employee enrollment mapping */
  async deleteMapping(
    orgId: string,
    deviceId: string,
    mappingId: string,
    actorId: string,
  ) {
    await this.getDevice(orgId, deviceId);

    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceDeviceMapping.delete({ where: { id: mappingId } });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          actorRole: ActorRole.USER,
          action: AuditAction.DELETE,
          entityName: 'AttendanceDeviceMapping',
          entityId: mappingId,
          reason: `Biometric mapping ${mappingId} removed`,
        },
      });
    });

    return { message: 'Device mapping removed successfully' };
  }

  /* Ingests batch biometric punches from authenticated hardware terminal */
  async ingestBiometricBatch(
    serialNumber: string,
    dto: BiometricPunchBatchDto,
  ) {
    const device = await this.deviceRepo.findBySerialGlobal(serialNumber);
    if (!device) {
      throw new NotFoundException(
        `Hardware device with serial ${serialNumber} not found`,
      );
    }

    if (device.status === DeviceStatus.DECOMMISSIONED) {
      throw new BadRequestException(
        `Device ${serialNumber} is decommissioned and cannot ingest punches`,
      );
    }

    /* Process batch via unified capture pipeline */
    const result = await this.captureService.captureBiometricBatch(
      device.orgId,
      device.id,
      dto.logs,
    );

    /* Update device heartbeat */
    await this.deviceRepo.updateHeartbeat(device.id, DeviceStatus.ONLINE);

    return result;
  }
}
