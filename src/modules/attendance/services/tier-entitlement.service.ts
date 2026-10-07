import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { RedisService } from '../../../common/redis/redis.service.js';
import {
  CaptureMethod,
  OrganizationTier,
} from '../enums/attendance.enums.js';

export interface TierEntitlements {
  tier: OrganizationTier;
  maxEmployees: number;
  historyRetentionDays: number;
  allowedCaptureMethods: CaptureMethod[];
  maxLocations: number;
  allowOvertime: boolean;
  auditLogRetentionDays: number;
}

const TIER_POLICY_MATRIX: Record<OrganizationTier, TierEntitlements> = {
  [OrganizationTier.FREE]: {
    tier: OrganizationTier.FREE,
    maxEmployees: 10,
    historyRetentionDays: 30,
    allowedCaptureMethods: [CaptureMethod.QR_CODE, CaptureMethod.MANUAL_ADMIN],
    maxLocations: 1,
    allowOvertime: false,
    auditLogRetentionDays: 7,
  },
  [OrganizationTier.STARTER]: {
    tier: OrganizationTier.STARTER,
    maxEmployees: 50,
    historyRetentionDays: 365,
    allowedCaptureMethods: [
      CaptureMethod.QR_CODE,
      CaptureMethod.GEOLOCATION,
      CaptureMethod.MANUAL_ADMIN,
    ],
    maxLocations: 1,
    allowOvertime: true,
    auditLogRetentionDays: 90,
  },
  [OrganizationTier.BUSINESS]: {
    tier: OrganizationTier.BUSINESS,
    maxEmployees: 250,
    historyRetentionDays: 999999,
    allowedCaptureMethods: [
      CaptureMethod.QR_CODE,
      CaptureMethod.GEOLOCATION,
      CaptureMethod.BIOMETRIC_API,
      CaptureMethod.MANUAL_ADMIN,
    ],
    maxLocations: 10,
    allowOvertime: true,
    auditLogRetentionDays: 365,
  },
  [OrganizationTier.ENTERPRISE]: {
    tier: OrganizationTier.ENTERPRISE,
    maxEmployees: 999999,
    historyRetentionDays: 999999,
    allowedCaptureMethods: [
      CaptureMethod.QR_CODE,
      CaptureMethod.GEOLOCATION,
      CaptureMethod.BIOMETRIC_API,
      CaptureMethod.MANUAL_ADMIN,
    ],
    maxLocations: 999999,
    allowOvertime: true,
    auditLogRetentionDays: 999999,
  },
};

@Injectable()
export class TierEntitlementService {
  private readonly logger = new Logger(TierEntitlementService.name);
  private readonly CACHE_TTL_SECONDS = 3600; /* 1-hour in-memory cache */

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /* Resolves organization tier entitlements with zero-latency Redis cache */
  async getEntitlements(orgId: string): Promise<TierEntitlements> {
    const cacheKey = `tier:entitlements:${orgId}`;
    const cached = await this.redisService.getClient().get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached) as TierEntitlements;
      } catch {
        /* Fall through on parse error */
      }
    }

    /* Database lookup if cache miss */
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { tier: true, maxEmployees: true },
    });

    const tier = (org?.tier as OrganizationTier) ?? OrganizationTier.FREE;
    const basePolicy = TIER_POLICY_MATRIX[tier] ?? TIER_POLICY_MATRIX[OrganizationTier.FREE];

    const entitlements: TierEntitlements = {
      ...basePolicy,
      maxEmployees: org?.maxEmployees ? Math.max(org.maxEmployees, basePolicy.maxEmployees) : basePolicy.maxEmployees,
    };

    /* Store in Redis cache */
    await this.redisService
      .getClient()
      .set(cacheKey, JSON.stringify(entitlements), 'EX', this.CACHE_TTL_SECONDS);

    return entitlements;
  }

  /* Invalidate cached entitlements on subscription changes */
  async invalidateCache(orgId: string): Promise<void> {
    const cacheKey = `tier:entitlements:${orgId}`;
    await this.redisService.getClient().del(cacheKey);
  }

  /* Enforces employee seat quota; throws 402 Payment Required if exceeded */
  async enforceEmployeeLimit(orgId: string): Promise<void> {
    const entitlements = await this.getEntitlements(orgId);
    const activeCount = await this.prisma.employee.count({
      where: { orgId, isActive: true },
    });

    if (activeCount >= entitlements.maxEmployees) {
      this.logger.warn(
        `Employee seat limit exceeded for org ${orgId}: ${activeCount}/${entitlements.maxEmployees}`,
      );
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'Payment Required',
          message: `Employee quota exceeded for your ${entitlements.tier} plan (${activeCount}/${entitlements.maxEmployees} active seats). Please upgrade your subscription to add more employees.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /* Enforces allowed capture methods (QR, Geo, Biometric) based on plan tier */
  async enforceCaptureMethod(
    orgId: string,
    method: CaptureMethod,
  ): Promise<void> {
    const entitlements = await this.getEntitlements(orgId);

    if (!entitlements.allowedCaptureMethods.includes(method)) {
      throw new ForbiddenException(
        `Attendance capture via ${method} is not available on the ${entitlements.tier} plan. Please upgrade to a higher subscription tier to unlock this channel.`,
      );
    }
  }

  /* Enforces historical query retention window */
  async enforceHistoryRetention(
    orgId: string,
    targetDate: Date | string,
  ): Promise<void> {
    const entitlements = await this.getEntitlements(orgId);
    if (entitlements.historyRetentionDays >= 99999) {
      return;
    }

    const dateObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    if (isNaN(dateObj.getTime())) {
      return;
    }

    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays > entitlements.historyRetentionDays) {
      throw new ForbiddenException(
        `Your ${entitlements.tier} plan allows historical attendance queries up to ${entitlements.historyRetentionDays} days. Please upgrade to access historical records older than ${entitlements.historyRetentionDays} days.`,
      );
    }
  }
}
