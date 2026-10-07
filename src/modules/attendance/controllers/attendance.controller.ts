import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AttendanceService } from '../services/attendance.service.js';
import { AttendanceCaptureService } from '../services/attendance-capture.service.js';
import { ManualPunchDto } from '../dto/manual-punch.dto.js';
import { AttendanceQueryDto } from '../dto/attendance-query.dto.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Management & Query')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly captureService: AttendanceCaptureService,
  ) {}

  /* Manual administrative punch entry */
  @Post('manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record manual punch (Admin/HR)',
    description:
      'Creates an administrative attendance punch exception with mandatory reason and writes to immutable audit_logs.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Actor / Admin user ID', required: true })
  @ApiResponse({ status: 200, description: 'Manual punch recorded and calculation queued' })
  @ApiResponse({ status: 400, description: 'Missing actor header or invalid punch payload' })
  async recordManualPunch(
    @CurrentActor() actor: RequestActor,
    @Body() dto: ManualPunchDto,
  ) {
    return this.captureService.captureManualPunch(
      actor.orgId,
      actor.userId,
      dto,
    );
  }

  /* List paginated daily attendance records with multi-filters */
  @Get()
  @ApiOperation({
    summary: 'Query attendance records',
    description:
      'Retrieves paginated daily calculated attendance records with date range, employee, and status filters.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 200, description: 'Paginated attendance records list' })
  async getAttendanceRecords(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.getAttendanceRecords(actor.orgId, query);
  }

  /* Retrieve single employee attendance record and all punches for specific date */
  @Get(':employeeId/:date')
  @ApiOperation({
    summary: 'Get employee attendance for specific date',
    description:
      'Returns daily summary record and chronological list of all punches and location data for the date.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format', example: '2026-10-06' })
  @ApiResponse({ status: 200, description: 'Employee daily attendance breakdown' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async getEmployeeAttendanceByDate(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
  ) {
    return this.attendanceService.getEmployeeAttendanceByDate(
      actor.orgId,
      employeeId,
      date,
    );
  }
}
