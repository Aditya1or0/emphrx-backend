import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class QrPunchDto {
  @ApiProperty({
    description: 'Dynamic QR token scanned from the kiosk display',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  qrToken!: string;

  @ApiPropertyOptional({
    description: 'Unique client idempotency key to prevent accidental double-submission',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Mobile device hardware identifier',
    example: 'pixel-8-pro-uuid',
  })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Optional latitude for kiosk proximity check',
    example: 12.9716,
  })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Optional longitude for kiosk proximity check',
    example: 77.5946,
  })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'GPS accuracy radius in meters',
    example: 8.5,
  })
  @IsNumber()
  @IsOptional()
  gpsAccuracyMeters?: number;
}
