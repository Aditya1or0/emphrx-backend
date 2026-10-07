import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DeviceType,
  DeviceStatus,
  PunchType,
} from '../enums/attendance.enums.js';

/* DTO for registering physical biometric terminal */
export class RegisterDeviceDto {
  @ApiProperty({ description: 'Device human readable name', example: 'Gate 1 ZKTeco Terminal' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Hardware unique serial number', example: 'ZK-VF780-9921' })
  @IsString()
  @IsNotEmpty()
  serialNumber!: string;

  @ApiProperty({ enum: DeviceType, description: 'Device model/vendor type', example: DeviceType.ZKTECO })
  @IsEnum(DeviceType)
  deviceType!: DeviceType;

  @ApiPropertyOptional({ description: 'Static IP address of terminal', example: '192.168.1.120' })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}

/* DTO for updating device metadata or status */
export class UpdateDeviceDto {
  @ApiPropertyOptional({ description: 'Device human readable name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: DeviceType, description: 'Device model/vendor type' })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @ApiPropertyOptional({ description: 'Static IP address of terminal' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ enum: DeviceStatus, description: 'Operational device status' })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;
}

/* DTO for mapping employee to biometric enrollment ID on device */
export class CreateDeviceMappingDto {
  @ApiProperty({ description: 'Employee UUID', example: 'e4b9d031-15c2-4752-b88d-71b31a89c932' })
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({ description: 'Biometric enrollment identifier registered on device', example: '10042' })
  @IsString()
  @IsNotEmpty()
  biometricEnrollId!: string;
}

/* DTO for periodic device status heartbeat ping */
export class DeviceHeartbeatDto {
  @ApiProperty({ description: 'Hardware unique serial number', example: 'ZK-VF780-9921' })
  @IsString()
  @IsNotEmpty()
  serialNumber!: string;

  @ApiPropertyOptional({ enum: DeviceStatus, description: 'Device status override' })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ description: 'Current network IP address of terminal' })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}

/* Single punch log item in biometric batch payload */
export class BiometricPunchLogDto {
  @ApiProperty({ description: 'Biometric enrollment identifier on terminal', example: '10042' })
  @IsString()
  @IsNotEmpty()
  enrollmentId!: string;

  @ApiProperty({ description: 'Timestamp of punch recorded by terminal (ISO 8601)', example: '2026-10-06T08:58:30.000Z' })
  @IsString()
  @IsNotEmpty()
  timestamp!: string;

  @ApiProperty({ enum: PunchType, description: 'Punch direction type', example: PunchType.CHECK_IN })
  @IsEnum(PunchType)
  punchType!: PunchType;

  @ApiProperty({ description: 'Terminal unique internal log sequence identifier', example: 'LOG_77812' })
  @IsString()
  @IsNotEmpty()
  logId!: string;
}

/* Batch biometric punch payload pushed from hardware connector */
export class BiometricPunchBatchDto {
  @ApiProperty({ type: [BiometricPunchLogDto], description: 'List of captured punch log events' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BiometricPunchLogDto)
  logs!: BiometricPunchLogDto[];
}
