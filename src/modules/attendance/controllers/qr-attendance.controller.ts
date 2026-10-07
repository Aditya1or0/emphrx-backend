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
import { QrSessionService } from '../services/qr/qr-session.service.js';
import { AttendanceCaptureService } from '../services/attendance-capture.service.js';
import { CreateQrSessionDto, QrSessionResponseDto } from '../dto/qr-session.dto.js';
import { QrPunchDto } from '../dto/qr-punch.dto.js';
import { PunchType } from '../enums/attendance.enums.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Dynamic QR')
@Controller('attendance/qr')
export class QrAttendanceController {
  constructor(
    private readonly qrSessionService: QrSessionService,
    private readonly captureService: AttendanceCaptureService,
  ) {}

  /* Generates dynamic short-lived session token on kiosk tablet display */
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate dynamic QR session token',
    description:
      'Called by office kiosk displays every 15-30s. Generates a short-lived token and ephemeral nonce in Redis.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 201, description: 'QR session generated', type: QrSessionResponseDto })
  async createSession(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Body() dto: CreateQrSessionDto,
  ) {
    return this.qrSessionService.createSession(actor.orgId, dto);
  }

  /* Scanned by employee mobile app to clock in */
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dynamic QR check-in punch',
    description:
      'Scanned by employee mobile device. Atomically verifies and consumes nonce from Redis to prevent replay attacks.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Employee UUID (or x-employee-id)', required: true })
  @ApiResponse({ status: 200, description: 'Check-in recorded successfully' })
  @ApiResponse({ status: 400, description: 'Token expired, replay detected, or missing actor header' })
  async checkIn(
    @CurrentActor() actor: RequestActor,
    @Body() dto: QrPunchDto,
  ) {
    return this.captureService.captureQrPunch(
      actor.orgId,
      actor.userId,
      dto,
      PunchType.CHECK_IN,
    );
  }

  /* Scanned by employee mobile app to clock out */
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dynamic QR check-out punch',
    description:
      'Scanned by employee mobile device to clock out. Atomically consumes token nonce from Redis.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Employee UUID (or x-employee-id)', required: true })
  @ApiResponse({ status: 200, description: 'Check-out recorded successfully' })
  @ApiResponse({ status: 400, description: 'Token expired, replay detected, or missing actor header' })
  async checkOut(
    @CurrentActor() actor: RequestActor,
    @Body() dto: QrPunchDto,
  ) {
    return this.captureService.captureQrPunch(
      actor.orgId,
      actor.userId,
      dto,
      PunchType.CHECK_OUT,
    );
  }
}
