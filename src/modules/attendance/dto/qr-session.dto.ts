import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateQrSessionDto {
  @ApiProperty({
    description: 'Attendance location ID for the kiosk',
    example: '816e9a3f-68b6-45a0-b94f-4d362697ad99',
  })
  @IsUUID()
  @IsNotEmpty()
  locationId!: string;

  @ApiProperty({
    description: 'Unique kiosk terminal identifier',
    example: 'KIOSK-MAIN-RECEPTION-01',
  })
  @IsString()
  @IsNotEmpty()
  kioskIdentifier!: string;
}

export class QrSessionResponseDto {
  @ApiProperty({
    description: 'Signed dynamic QR JWT token with 30-second TTL',
  })
  qrToken!: string;

  @ApiProperty({
    description: 'Unique session nonce generated for this rotation',
  })
  sessionId!: string;

  @ApiProperty({
    description: 'ISO-8601 expiry timestamp',
  })
  expiresAt!: string;

  @ApiProperty({
    description: 'Recommended client rotation interval in seconds',
    example: 30,
  })
  refreshIntervalSeconds!: number;
}
