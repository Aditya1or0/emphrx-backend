import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpdateAttendanceSettingDto {
  @ApiPropertyOptional({
    description: 'Expected full-day working hours in minutes',
    example: 480,
    default: 480,
  })
  @IsInt()
  @Min(60)
  @Max(720)
  @IsOptional()
  defaultWorkHoursMinutes?: number;

  @ApiPropertyOptional({
    description: 'Minimum minutes required to be counted as Half Day',
    example: 240,
    default: 240,
  })
  @IsInt()
  @Min(60)
  @Max(360)
  @IsOptional()
  defaultHalfDayMinutes?: number;

  @ApiPropertyOptional({
    description: 'Allowed grace minutes after shift start before late marking',
    example: 15,
    default: 15,
  })
  @IsInt()
  @Min(0)
  @Max(60)
  @IsOptional()
  graceMinutes?: number;

  @ApiPropertyOptional({
    description: 'Minutes after grace period before late deduction kicks in',
    example: 15,
  })
  @IsInt()
  @Min(0)
  @Max(120)
  @IsOptional()
  lateMarkAfterMinutes?: number;

  @ApiPropertyOptional({
    description: 'Allowed early exit minutes before shift end',
    example: 15,
  })
  @IsInt()
  @Min(0)
  @Max(120)
  @IsOptional()
  earlyExitBeforeMinutes?: number;

  @ApiPropertyOptional({
    description: 'Overtime qualification threshold minutes past full day hours',
    example: 60,
  })
  @IsInt()
  @Min(15)
  @Max(300)
  @IsOptional()
  overtimeThresholdMinutes?: number;

  @ApiPropertyOptional({
    description: 'Minimum cooldown seconds between successive punches',
    example: 60,
  })
  @IsInt()
  @Min(10)
  @Max(600)
  @IsOptional()
  punchCooldownSeconds?: number;

  @ApiPropertyOptional({
    description: 'Maximum days in the past an employee is permitted to request regularization',
    example: 7,
  })
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  maxRegularizationDays?: number;

  @ApiPropertyOptional({
    description: 'Weekly scheduled off days',
    enum: DayOfWeek,
    isArray: true,
    example: ['SATURDAY', 'SUNDAY'],
  })
  @IsArray()
  @IsEnum(DayOfWeek, { each: true })
  @IsOptional()
  weeklyOffDays?: DayOfWeek[];

  @ApiPropertyOptional({
    description: 'Whether employees are permitted to submit WFH requests',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  allowWfh?: boolean;

  @ApiPropertyOptional({
    description: 'Whether QR code punches also require GPS geofence validation',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  requireGeoForQr?: boolean;
}
