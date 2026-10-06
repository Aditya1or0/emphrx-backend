import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PunchType } from '../enums/attendance.enums.js';

export class ManualPunchDto {
  @ApiProperty({
    description: 'Target employee ID',
    example: '816e9a3f-68b6-45a0-b94f-4d362697ad99',
  })
  @IsUUID()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({
    description: 'Punch direction',
    enum: PunchType,
    example: PunchType.CHECK_IN,
  })
  @IsEnum(PunchType)
  @IsNotEmpty()
  punchType!: PunchType;

  @ApiProperty({
    description: 'ISO-8601 punch timestamp',
    example: '2026-10-06T09:00:00.000Z',
  })
  @IsISO8601()
  @IsNotEmpty()
  punchTime!: string;

  @ApiProperty({
    description: 'Administrative reason for manual punch entry',
    example: 'Biometric reader network disconnect at entrance',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({
    description: 'Attendance location ID if associated with a worksite',
    example: '816e9a3f-68b6-45a0-b94f-4d362697ad99',
  })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Optional unique client idempotency key',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;
}
