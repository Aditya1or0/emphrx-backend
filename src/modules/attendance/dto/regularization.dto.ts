import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRegularizationDto {
  @ApiProperty({
    description: 'Attendance record ID to regularize',
    example: '816e9a3f-68b6-45a0-b94f-4d362697ad99',
  })
  @IsUUID()
  @IsNotEmpty()
  recordId!: string;

  @ApiPropertyOptional({
    description: 'Requested corrected check-in timestamp',
    example: '2026-10-06T09:00:00.000Z',
  })
  @IsISO8601()
  @IsOptional()
  requestedCheckIn?: string;

  @ApiPropertyOptional({
    description: 'Requested corrected check-out timestamp',
    example: '2026-10-06T18:00:00.000Z',
  })
  @IsISO8601()
  @IsOptional()
  requestedCheckOut?: string;

  @ApiProperty({
    description: 'Justification reason for regularization',
    example: 'Forgot mobile phone at home; punched via receptionist log',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ActionRegularizationDto {
  @ApiPropertyOptional({
    description: 'Manager approval or rejection comments',
    example: 'Verified with team lead and approve',
  })
  @IsString()
  @IsOptional()
  actionReason?: string;
}
