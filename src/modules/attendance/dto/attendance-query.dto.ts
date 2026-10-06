import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceStatus } from '../enums/attendance.enums.js';

export class AttendanceQueryDto {
  @ApiPropertyOptional({
    description: 'Filter from start date (YYYY-MM-DD or ISO-8601)',
    example: '2026-10-01',
  })
  @IsISO8601()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter up to end date (YYYY-MM-DD or ISO-8601)',
    example: '2026-10-31',
  })
  @IsISO8601()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific employee ID',
    example: '816e9a3f-68b6-45a0-b94f-4d362697ad99',
  })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by daily attendance status',
    enum: AttendanceStatus,
    example: AttendanceStatus.PRESENT,
  })
  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;

  @ApiPropertyOptional({
    description: 'Page index for pagination',
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
