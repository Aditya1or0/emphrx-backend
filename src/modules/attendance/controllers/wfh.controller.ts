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
import { WfhService } from '../services/wfh.service.js';
import { CreateWfhDto, ActionWfhDto } from '../dto/wfh.dto.js';
import { CurrentActor } from '../../../common/decorators/current-actor.decorator.js';
import type { RequestActor } from '../../../common/interfaces/request-actor.interface.js';

@ApiTags('Attendance - Work From Home')
@Controller('attendance/wfh')
export class WfhController {
  constructor(private readonly wfhService: WfhService) {}

  /* Submit Work From Home request */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit Work From Home request',
    description: 'Employee submits dates and reasons for remote work.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Employee UUID (or x-employee-id)', required: true })
  @ApiResponse({ status: 201, description: 'WFH request submitted' })
  @ApiResponse({ status: 400, description: 'Missing actor header or invalid payload' })
  async createRequest(
    @CurrentActor() actor: RequestActor,
    @Body() dto: CreateWfhDto,
  ) {
    return this.wfhService.createRequest(actor.orgId, actor.userId, dto);
  }

  /* Approve WFH request */
  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve Work From Home request (Manager/HR)',
    description:
      'Approves WFH request, sets WORK_FROM_HOME status on matching daily records, and writes to audit log.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Approver user UUID', required: true })
  @ApiParam({ name: 'id', description: 'WFH Request UUID' })
  @ApiResponse({ status: 200, description: 'WFH request approved' })
  @ApiResponse({ status: 400, description: 'Missing actor header or request cannot be approved' })
  async approveRequest(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: ActionWfhDto,
  ) {
    return this.wfhService.approveRequest(
      actor.orgId,
      id,
      actor.userId,
      dto,
    );
  }

  /* Reject WFH request */
  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Reject Work From Home request (Manager/HR)',
    description: 'Rejects request with comments and writes to audit log.',
  })
  @ApiHeader({ name: 'x-org-id', description: 'Tenant Organization UUID', required: true })
  @ApiHeader({ name: 'x-actor-id', description: 'Rejector user UUID', required: true })
  @ApiParam({ name: 'id', description: 'WFH Request UUID' })
  @ApiResponse({ status: 200, description: 'WFH request rejected' })
  @ApiResponse({ status: 400, description: 'Missing actor header or request cannot be rejected' })
  async rejectRequest(
    @CurrentActor() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: ActionWfhDto,
  ) {
    return this.wfhService.rejectRequest(
      actor.orgId,
      id,
      actor.userId,
      dto,
    );
  }

  /* List employee WFH requests */
  @Get('employee/:employeeId')
  @ApiOperation({
    summary: 'List employee WFH requests',
    description: 'Retrieves history of WFH requests for an employee.',
  })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'List of WFH requests' })
  async getEmployeeRequests(@Param('employeeId') employeeId: string) {
    return this.wfhService.getEmployeeRequests(employeeId);
  }
}
