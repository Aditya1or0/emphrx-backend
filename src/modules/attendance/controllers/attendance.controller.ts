import {
  Body,
  Controller,
  Get,
  Headers,
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
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: false })
  @ApiHeader({ name: 'x-actor-id', description: 'Actor user ID', required: false })
  @ApiHeader({ name: 'x-actor-role', description: 'Actor role (e.g. HR_ADMIN)', required: false })
  @ApiResponse({ status: 200, description: 'Manual punch recorded and calculation queued' })
  async recordManualPunch(
    @Headers('x-org-id') orgId: string,
    @Headers('x-actor-id') actorId: string,
    @Headers('x-actor-role') actorRole: string,
    @Body() dto: ManualPunchDto,
  ) {
    const resolvedOrgId = orgId || 'default-org-id';
    const resolvedActorId = actorId || 'admin-actor';
    const resolvedRole = actorRole || 'HR_ADMIN';
    return this.captureService.captureManualPunch(
      resolvedOrgId,
      resolvedActorId,
      resolvedRole,
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
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: false })
  @ApiResponse({ status: 200, description: 'Paginated attendance records list' })
  async getAttendanceRecords(
    @Headers('x-org-id') orgId: string,
    @Query() query: AttendanceQueryDto,
  ) {
    const resolvedOrgId = orgId || 'default-org-id';
    return this.attendanceService.getAttendanceRecords(resolvedOrgId, query);
  }

  /* Retrieve single employee attendance record and all punches for specific date */
  @Get(':employeeId/:date')
  @ApiOperation({
    summary: 'Get employee attendance for specific date',
    description:
      'Returns daily summary record and chronological list of all punches and location data for the date.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: false })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format', example: '2026-10-06' })
  @ApiResponse({ status: 200, description: 'Employee daily attendance breakdown' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async getEmployeeAttendanceByDate(
    @Headers('x-org-id') orgId: string,
    @Param('employeeId') employeeId: string,
    @Param('date') date: string,
  ) {
    const resolvedOrgId = orgId || 'default-org-id';
    return this.attendanceService.getEmployeeAttendanceByDate(
      resolvedOrgId,
      employeeId,
      date,
    );
  }
}
