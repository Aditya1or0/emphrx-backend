import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWfhDto {
  @ApiProperty({
    description: 'Start date in YYYY-MM-DD format',
    example: '2026-10-10',
  })
  @IsDateString()
  @IsNotEmpty()
  fromDate!: string;

  @ApiProperty({
    description: 'End date in YYYY-MM-DD format',
    example: '2026-10-12',
  })
  @IsDateString()
  @IsNotEmpty()
  toDate!: string;

  @ApiProperty({
    description: 'Reason for requesting Work From Home',
    example: 'Broadband technician home visit',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ActionWfhDto {
  @ApiPropertyOptional({
    description: 'Manager notes or justification',
    example: 'Approved as per remote policy',
  })
  @IsString()
  @IsOptional()
  actionReason?: string;
}
