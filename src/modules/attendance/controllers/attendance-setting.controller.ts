import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AttendanceSettingService } from '../services/attendance-setting.service.js';
import { UpdateAttendanceSettingDto } from '../dto/attendance-setting.dto.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Organization Settings')
@Controller('attendance/settings')
export class AttendanceSettingController {
  constructor(
    private readonly settingsService: AttendanceSettingService,
  ) {}

  /* Fetch organization attendance rules and settings */
  @Get()
  @ApiOperation({
    summary: 'Get organization attendance settings',
    description:
      'Returns configurable working hours, half-day hours, grace periods, weekly off-days, and holiday calendar.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 200, description: 'Current attendance settings' })
  async getSettings(@CurrentActor({ requireUser: false }) actor: RequestActor) {
    return this.settingsService.getSettings(actor.orgId);
  }

  /* Update organization attendance parameters */
  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update organization attendance settings',
    description:
      'Updates working hours, grace period, overtime threshold, or off days and writes audit log.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Admin user UUID', required: true })
  @ApiResponse({ status: 200, description: 'Attendance settings updated' })
  @ApiResponse({ status: 400, description: 'Missing actor header or invalid settings payload' })
  async updateSettings(
    @CurrentActor() actor: RequestActor,
    @Body() dto: UpdateAttendanceSettingDto,
  ) {
    return this.settingsService.updateSettings(
      actor.orgId,
      actor.userId,
      dto,
    );
  }
}
