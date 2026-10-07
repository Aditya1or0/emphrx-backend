import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { AuditLogQueryDto } from '../dto/analytics-export.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* Query paginated immutable audit logs with multi-filters */
  async findMany(orgId: string, query: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      orgId,
      ...(query.entityName ? { entityName: query.entityName } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }
}
