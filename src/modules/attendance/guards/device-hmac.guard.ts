import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AttendanceDeviceRepository } from '../repositories/attendance-device.repository.js';
import { verifyHmacSignature } from '../utils/hmac.util.js';
import { DeviceStatus } from '../enums/attendance.enums.js';

interface DeviceRequest extends FastifyRequest {
  device?: unknown;
}

@Injectable()
export class DeviceHmacGuard implements CanActivate {
  constructor(private readonly deviceRepo: AttendanceDeviceRepository) {}

  /* Enforces HMAC-SHA256 signature verification and clock-drift protection on hardware endpoints */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const headers = request.headers;

    const serialNumber = headers['x-device-serial'] as string | undefined;
    const signature = headers['x-signature'] as string | undefined;
    const timestamp = headers['x-timestamp'] as string | undefined;

    if (!serialNumber || !signature || !timestamp) {
      throw new UnauthorizedException(
        'Missing required biometric headers: x-device-serial, x-signature, x-timestamp',
      );
    }

    const device = await this.deviceRepo.findBySerialGlobal(serialNumber);
    if (!device) {
      throw new UnauthorizedException(
        `Hardware device with serial ${serialNumber} not registered in system`,
      );
    }

    if (device.status === DeviceStatus.DECOMMISSIONED) {
      throw new UnauthorizedException(
        `Hardware device ${serialNumber} is decommissioned and cannot ingest punches`,
      );
    }

    const isValid = verifyHmacSignature(
      device.apiKeyHash,
      request.body ?? {},
      timestamp,
      signature,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        'Invalid biometric HMAC signature or timestamp expired beyond 5-minute clock drift',
      );
    }

    /* Attach authenticated device entity to request context */
    request.device = device;
    return true;
  }
}
