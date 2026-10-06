import {
  Body,
  Controller,
  Headers,
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
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: false })
  @ApiResponse({ status: 201, description: 'QR session generated', type: QrSessionResponseDto })
  async createSession(
    @Headers('x-org-id') orgId: string,
    @Body() dto: CreateQrSessionDto,
  ) {
    const resolvedOrgId = orgId || 'default-org-id';
    return this.qrSessionService.createSession(resolvedOrgId, dto);
  }

  /* Scanned by employee mobile app to clock in */
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dynamic QR check-in punch',
    description:
      'Scanned by employee mobile device. Atomically verifies and consumes nonce from Redis to prevent replay attacks.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: false })
  @ApiHeader({ name: 'x-employee-id', description: 'Employee UUID', required: false })
  @ApiResponse({ status: 200, description: 'Check-in recorded successfully' })
  @ApiResponse({ status: 400, description: 'Token expired or replay detected' })
  async checkIn(
    @Headers('x-org-id') orgId: string,
    @Headers('x-employee-id') employeeId: string,
    @Body() dto: QrPunchDto,
  ) {
    const resolvedOrgId = orgId || 'default-org-id';
    const resolvedEmpId = employeeId || 'default-employee-id';
    return this.captureService.captureQrPunch(
      resolvedOrgId,
      resolvedEmpId,
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
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: false })
  @ApiHeader({ name: 'x-employee-id', description: 'Employee UUID', required: false })
  @ApiResponse({ status: 200, description: 'Check-out recorded successfully' })
  @ApiResponse({ status: 400, description: 'Token expired or replay detected' })
  async checkOut(
    @Headers('x-org-id') orgId: string,
    @Headers('x-employee-id') employeeId: string,
    @Body() dto: QrPunchDto,
  ) {
    const resolvedOrgId = orgId || 'default-org-id';
    const resolvedEmpId = employeeId || 'default-employee-id';
    return this.captureService.captureQrPunch(
      resolvedOrgId,
      resolvedEmpId,
      dto,
      PunchType.CHECK_OUT,
    );
  }
}
