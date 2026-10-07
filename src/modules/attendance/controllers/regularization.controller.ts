import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RegularizationService } from '../services/regularization.service.js';
import {
  CreateRegularizationDto,
  ActionRegularizationDto,
} from '../dto/regularization.dto.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Regularizations')
@Controller('attendance/regularizations')
export class RegularizationController {
  constructor(private readonly regularizationService: RegularizationService) {}

  /* Submit attendance regularization request */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit attendance regularization request',
    description:
      'Employee submits a correction request for missed or inaccurate check-in/out timestamps.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Employee UUID (or x-employee-id)', required: true })
  @ApiResponse({ status: 201, description: 'Regularization request submitted' })
  @ApiResponse({ status: 400, description: 'Missing actor header or invalid payload' })
  async createRequest(
    @CurrentActor() actor: RequestActor,
    @Body() dto: CreateRegularizationDto,
  ) {
    return this.regularizationService.createRequest(
      actor.orgId,
      actor.userId,
      dto,
    );
  }

  /* Approve regularization request */
  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve regularization request (Manager/HR)',
    description:
      'Approves request, updates daily record boundaries, logs to audit trail, and triggers BullMQ recalculation.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Approver user UUID', required: true })
  @ApiParam({ name: 'id', description: 'Regularization UUID' })
  @ApiResponse({ status: 200, description: 'Regularization approved and recalculated' })
  @ApiResponse({ status: 400, description: 'Missing actor header or request cannot be approved' })
  async approveRequest(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: ActionRegularizationDto,
  ) {
    return this.regularizationService.approveRequest(
      actor.orgId,
      id,
      actor.userId,
      dto,
    );
  }

  /* Reject regularization request */
  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Reject regularization request (Manager/HR)',
    description: 'Rejects request and writes reason to audit log.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Rejector user UUID', required: true })
  @ApiParam({ name: 'id', description: 'Regularization UUID' })
  @ApiResponse({ status: 200, description: 'Regularization rejected' })
  @ApiResponse({ status: 400, description: 'Missing actor header or request cannot be rejected' })
  async rejectRequest(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: ActionRegularizationDto,
  ) {
    return this.regularizationService.rejectRequest(
      actor.orgId,
      id,
      actor.userId,
      dto,
    );
  }

  /* List employee regularization requests */
  @Get('employee/:employeeId')
  @ApiOperation({
    summary: 'List employee regularizations',
    description: 'Returns all historical regularizations for an employee.',
  })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Employee regularization requests list' })
  async getEmployeeRequests(@Param('employeeId') employeeId: string) {
    return this.regularizationService.getEmployeeRequests(employeeId);
  }
}
