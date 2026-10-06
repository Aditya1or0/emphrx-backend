import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class GeoPunchDto {
  @ApiProperty({
    description: 'Latitude coordinate from device GPS',
    example: 12.9716,
  })
  @IsNumber()
  @IsNotEmpty()
  latitude!: number;

  @ApiProperty({
    description: 'Longitude coordinate from device GPS',
    example: 77.5946,
  })
  @IsNumber()
  @IsNotEmpty()
  longitude!: number;

  @ApiPropertyOptional({
    description: 'GPS accuracy radius in meters',
    example: 12.5,
  })
  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({
    description: 'Specific office location ID (auto-resolved to nearest if omitted)',
    example: '816e9a3f-68b6-45a0-b94f-4d362697ad99',
  })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency key to prevent double punches',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Optional employee remarks or note',
    example: 'Client site morning visit',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
