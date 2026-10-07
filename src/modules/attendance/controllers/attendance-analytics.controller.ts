import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AttendanceAnalyticsService } from '../services/attendance-analytics.service.js';
import { AttendanceExportService } from '../services/attendance-export.service.js';
import { AuditLogRepository } from '../repositories/audit-log.repository.js';
import {
  AttendanceAnalyticsQueryDto,
  AttendanceExportQueryDto,
  AuditLogQueryDto,
} from '../dto/analytics-export.dto.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Analytics & Enterprise')
@Controller('attendance')
export class AttendanceAnalyticsController {
  constructor(
    private readonly analyticsService: AttendanceAnalyticsService,
    private readonly exportService: AttendanceExportService,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  /* Query aggregated attendance metrics and daily trends */
  @Get('analytics/overview')
  @ApiOperation({
    summary: 'Organization attendance analytics overview',
    description:
      'Aggregates present percentage, late occurrences, overtime hours, and daily status breakdown across subscription retention window.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 200, description: 'Aggregated analytics metrics and trend' })
  @ApiResponse({ status: 403, description: 'Requested date range exceeds plan retention limit' })
  async getOverview(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Query() query: AttendanceAnalyticsQueryDto,
  ) {
    return this.analyticsService.getOverview(actor.orgId, query);
  }

  /* Streaming CSV timesheet report export */
  @Get('export')
  @ApiOperation({
    summary: 'Export timesheet report as streaming CSV',
    description:
      'Generates and streams a downloadable CSV timesheet report for employees with shift rules and status breakdown.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 200, description: 'Downloadable CSV timesheet stream' })
  @ApiResponse({ status: 403, description: 'Date range exceeds plan retention limit' })
  async exportTimesheet(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Query() query: AttendanceExportQueryDto,
    @Res({ passthrough: false }) reply: FastifyReply,
  ) {
    const result = await this.exportService.generateTimesheetCsv(
      actor.orgId,
      query,
    );

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return reply.send(result.csvContent);
  }

  /* Query immutable compliance audit logs */
  @Get('audit-logs')
  @ApiOperation({
    summary: 'Query compliance audit trail',
    description:
      'Retrieves immutable audit logs for administrative overrides, regularizations, and settings modifications.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  async getAuditLogs(
    @CurrentActor({ requireUser: false }) actor: RequestActor,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.auditRepo.findMany(actor.orgId, query);
  }
}
