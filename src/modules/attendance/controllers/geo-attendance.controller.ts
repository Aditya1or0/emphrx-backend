import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AttendanceCaptureService } from '../services/attendance-capture.service.js';
import { GeoPunchDto } from '../dto/geo-punch.dto.js';
import { PunchType } from '../enums/attendance.enums.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Geolocation & Geofencing')
@Controller('attendance/geo')
export class GeoAttendanceController {
  constructor(
    private readonly captureService: AttendanceCaptureService,
  ) {}

  /* Mobile GPS check-in with server-side geofencing */
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mobile GPS geofenced check-in',
    description:
      'Captures mobile GPS coordinates, validates proximity against office geofence via Haversine formula, and logs check-in.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Employee UUID (or x-employee-id)', required: true })
  @ApiResponse({ status: 200, description: 'GPS check-in recorded successfully' })
  @ApiResponse({ status: 400, description: 'Missing actor header or geofence violation' })
  @ApiResponse({ status: 409, description: 'Concurrent punch debounced' })
  async checkIn(
    @CurrentActor() actor: RequestActor,
    @Body() dto: GeoPunchDto,
  ) {
    return this.captureService.captureGeoPunch(
      actor.orgId,
      actor.userId,
      dto,
      PunchType.CHECK_IN,
    );
  }

  /* Mobile GPS check-out with server-side geofencing */
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mobile GPS geofenced check-out',
    description:
      'Captures mobile GPS coordinates, checks office radius boundaries, and logs check-out.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Employee UUID (or x-employee-id)', required: true })
  @ApiResponse({ status: 200, description: 'GPS check-out recorded successfully' })
  @ApiResponse({ status: 400, description: 'Missing actor header or geofence violation' })
  @ApiResponse({ status: 409, description: 'Concurrent punch debounced' })
  async checkOut(
    @CurrentActor() actor: RequestActor,
    @Body() dto: GeoPunchDto,
  ) {
    return this.captureService.captureGeoPunch(
      actor.orgId,
      actor.userId,
      dto,
      PunchType.CHECK_OUT,
    );
  }
}
