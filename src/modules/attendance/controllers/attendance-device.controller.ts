import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AttendanceDeviceService } from '../services/attendance-device.service.js';
import {
  RegisterDeviceDto,
  UpdateDeviceDto,
  CreateDeviceMappingDto,
  DeviceHeartbeatDto,
  BiometricPunchBatchDto,
} from '../dto/device.dto.js';
import { DeviceHmacGuard } from '../guards/device-hmac.guard.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Biometric Terminals')
@Controller('attendance')
export class AttendanceDeviceController {
  constructor(private readonly deviceService: AttendanceDeviceService) {}

  /* Register physical biometric terminal and generate credentials */
  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register biometric hardware terminal',
    description:
      'Creates physical terminal entity in organization and generates a cryptographically secure API key for HMAC signing.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Admin user UUID', required: true })
  @ApiResponse({ status: 201, description: 'Device registered and API key generated' })
  @ApiResponse({ status: 409, description: 'Serial number already registered' })
  async registerDevice(
    @CurrentActor() actor: RequestActor,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.deviceService.registerDevice(actor.orgId, actor.userId, dto);
  }

  /* List physical biometric terminals registered under organization */
  @Get('devices')
  @ApiOperation({
    summary: 'List biometric hardware terminals',
    description: 'Retrieves all physical terminals and operational status for the organization.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 200, description: 'List of registered terminals' })
  async listDevices(@CurrentActor({ requireUser: false }) actor: RequestActor) {
    return this.deviceService.listDevices(actor.orgId);
  }

  /* Retrieve details for a single biometric device */
  @Get('devices/:id')
  @ApiOperation({
    summary: 'Get biometric terminal details',
    description: 'Returns metadata, connectivity status, and registration info for a terminal.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiParam({ name: 'id', description: 'Device UUID' })
  @ApiResponse({ status: 200, description: 'Device details' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async getDevice(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Param('id') id: string,
  ) {
    return this.deviceService.getDevice(actor.orgId, id);
  }

  /* Update terminal metadata, status, or network address */
  @Patch('devices/:id')
  @ApiOperation({
    summary: 'Update biometric terminal parameters',
    description: 'Updates device status (ONLINE, OFFLINE, MAINTENANCE), IP address, or label.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Admin user UUID', required: true })
  @ApiParam({ name: 'id', description: 'Device UUID' })
  @ApiResponse({ status: 200, description: 'Device updated successfully' })
  async updateDevice(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.deviceService.updateDevice(
      actor.orgId,
      id,
      actor.userId,
      dto,
    );
  }

  /* Delete terminal record from organization */
  @Delete('devices/:id')
  @ApiOperation({
    summary: 'Decommission/Delete biometric terminal',
    description: 'Removes hardware terminal registration and writes audit log.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Admin user UUID', required: true })
  @ApiParam({ name: 'id', description: 'Device UUID' })
  @ApiResponse({ status: 200, description: 'Device deleted successfully' })
  async deleteDevice(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
  ) {
    return this.deviceService.deleteDevice(actor.orgId, id, actor.userId);
  }

  /* Map employee to biometric enrollment ID on device */
  @Post('devices/:id/mappings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Map employee to biometric enrollment ID',
    description:
      'Associates employee record with their fingerprint/face enrollment ID stored on the physical terminal.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Admin user UUID', required: true })
  @ApiParam({ name: 'id', description: 'Device UUID' })
  @ApiResponse({ status: 201, description: 'Biometric mapping created' })
  @ApiResponse({ status: 409, description: 'Enrollment ID already mapped' })
  async createMapping(
    @CurrentActor() actor: RequestActor,
    @Param('id') deviceId: string,
    @Body() dto: CreateDeviceMappingDto,
  ) {
    return this.deviceService.createMapping(
      actor.orgId,
      deviceId,
      actor.userId,
      dto,
    );
  }

  /* List employee enrollment mappings for specific terminal */
  @Get('devices/:id/mappings')
  @ApiOperation({
    summary: 'List employee enrollment mappings on terminal',
    description: 'Retrieves all mapped employees and their biometric enrollment IDs.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiParam({ name: 'id', description: 'Device UUID' })
  @ApiResponse({ status: 200, description: 'List of enrollment mappings' })
  async listMappings(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Param('id') deviceId: string,
  ) {
    return this.deviceService.listMappings(actor.orgId, deviceId);
  }

  /* Remove employee biometric mapping from device */
  @Delete('devices/:id/mappings/:mappingId')
  @ApiOperation({
    summary: 'Delete employee biometric mapping',
    description: 'Deletes employee enrollment association from device.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Admin user UUID', required: true })
  @ApiParam({ name: 'id', description: 'Device UUID' })
  @ApiParam({ name: 'mappingId', description: 'Mapping UUID' })
  @ApiResponse({ status: 200, description: 'Mapping deleted successfully' })
  async deleteMapping(
    @CurrentActor() actor: RequestActor,
    @Param('id') deviceId: string,
    @Param('mappingId') mappingId: string,
  ) {
    return this.deviceService.deleteMapping(
      actor.orgId,
      deviceId,
      mappingId,
      actor.userId,
    );
  }

  /* Hardware heartbeat ping updating last seen status */
  @Post('devices/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Biometric terminal heartbeat',
    description:
      'Called by hardware devices periodically to maintain ONLINE status and report network status.',
  })
  @ApiHeader({ name: 'x-device-serial', description: 'Terminal hardware serial number', required: false })
  @ApiResponse({ status: 200, description: 'Heartbeat recorded successfully' })
  async recordHeartbeat(
    @Body() dto: DeviceHeartbeatDto,
    @Headers('x-device-serial') serialHeader?: string,
  ) {
    const serialNumber = dto.serialNumber || serialHeader;
    return this.deviceService.recordHeartbeat(serialNumber!, dto);
  }

  /* High-throughput batch biometric punch ingestion */
  @Post('devices/punch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DeviceHmacGuard)
  @ApiOperation({
    summary: 'Batch biometric punch ingestion (HMAC protected)',
    description:
      'High-throughput endpoint called by biometric push servers or edge connectors. Authenticated via HMAC-SHA256 signature.',
  })
  @ApiHeader({ name: 'x-device-serial', description: 'Terminal serial number', required: true })
  @ApiHeader({ name: 'x-signature', description: 'HMAC-SHA256 signature', required: true })
  @ApiHeader({ name: 'x-timestamp', description: 'Request Unix timestamp (5-minute drift window)', required: true })
  @ApiResponse({ status: 200, description: 'Batch processed successfully with duplicate deduplication' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature or timestamp expired' })
  async ingestBiometricBatch(
    @Headers('x-device-serial') serialNumber: string,
    @Body() dto: BiometricPunchBatchDto,
  ) {
    return this.deviceService.ingestBiometricBatch(serialNumber, dto);
  }

  /* Alias endpoint matching singular path specification */
  @Post('device/punch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DeviceHmacGuard)
  @ApiOperation({
    summary: 'Batch biometric punch ingestion (Singular route alias)',
    description: 'Alias for /attendance/devices/punch matching Phase 3 specification.',
  })
  @ApiHeader({ name: 'x-device-serial', description: 'Terminal serial number', required: true })
  @ApiHeader({ name: 'x-signature', description: 'HMAC-SHA256 signature', required: true })
  @ApiHeader({ name: 'x-timestamp', description: 'Request Unix timestamp', required: true })
  @ApiResponse({ status: 200, description: 'Batch processed successfully' })
  async ingestBiometricBatchAlias(
    @Headers('x-device-serial') serialNumber: string,
    @Body() dto: BiometricPunchBatchDto,
  ) {
    return this.deviceService.ingestBiometricBatch(serialNumber, dto);
  }
}
