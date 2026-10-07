import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/* Query DTO for attendance analytics overview */
export class AttendanceAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Filter start date (YYYY-MM-DD)', example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter end date (YYYY-MM-DD)', example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/* Query DTO for streaming timesheet exports */
export class AttendanceExportQueryDto {
  @ApiPropertyOptional({ description: 'Report start date (YYYY-MM-DD)', example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Report end date (YYYY-MM-DD)', example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv', description: 'Export file format' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'csv';

  @ApiPropertyOptional({ description: 'Filter by employee department UUID' })
  @IsOptional()
  @IsString()
  departmentId?: string;
}

/* Query DTO for compliance audit log history */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by entity model name', example: 'AttendanceSetting' })
  @IsOptional()
  @IsString()
  entityName?: string;

  @ApiPropertyOptional({ description: 'Filter by target entity UUID' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Filter by acting actor UUID' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter start date (YYYY-MM-DD)', example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter end date (YYYY-MM-DD)', example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, description: 'Items per page (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 50;
}
