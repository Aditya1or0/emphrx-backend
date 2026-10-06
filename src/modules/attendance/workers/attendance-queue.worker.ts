import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service.js';
import { AttendanceCalculationService } from '../services/attendance-calculation.service.js';
import { OutboxStatus } from '../enums/attendance.enums.js';

interface CalculationJobData {
  orgId: string;
  employeeId: string;
  businessDate: string;
}

@Injectable()
export class AttendanceQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceQueueWorker.name);
  private queue!: Queue<CalculationJobData>;
  private worker!: Worker<CalculationJobData>;
  private pollingTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: AttendanceCalculationService,
  ) {}

  onModuleInit(): void {
    const connection = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    /* Initialize BullMQ queue */
    this.queue = new Queue<CalculationJobData>('attendance.calculate', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });

    /* Initialize async worker processor */
    this.worker = new Worker<CalculationJobData>(
      'attendance.calculate',
      async (job) => {
        const { orgId, employeeId, businessDate } = job.data;
        await this.calculationService.recalculateDay(
          orgId,
          employeeId,
          new Date(businessDate),
        );
      },
      { connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Attendance calculation job ${job?.id} failed: ${err.message}`,
      );
    });

    /* Start lightweight transactional outbox relay polling */
    this.startOutboxRelay();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    await this.worker?.close();
    await this.queue?.close();
  }

  /* Pushes direct calculation job to queue */
  async enqueueCalculation(
    orgId: string,
    employeeId: string,
    businessDate: Date,
  ): Promise<void> {
    const dateStr = businessDate.toISOString().split('T')[0];
    await this.queue.add(
      'recalculate',
      {
        orgId,
        employeeId,
        businessDate: dateStr,
      },
      {
        jobId: `calc_${orgId}_${employeeId}_${dateStr}`,
      },
    );
  }

  /* Lightweight transactional outbox poller forwarding pending events to BullMQ */
  private startOutboxRelay(): void {
    this.pollingTimer = setInterval(async () => {
      try {
        const pendingEvents = await this.prisma.outboxEvent.findMany({
          where: { status: OutboxStatus.PENDING },
          take: 50,
          orderBy: { createdAt: 'asc' },
        });

        for (const event of pendingEvents) {
          const payload = event.payload as {
            employeeId?: string;
            businessDate?: string;
          };

          if (payload.employeeId && payload.businessDate) {
            await this.enqueueCalculation(
              event.orgId,
              payload.employeeId,
              new Date(payload.businessDate),
            );
          }

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: OutboxStatus.PROCESSED,
              processedAt: new Date(),
            },
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Outbox relay processing error: ${message}`);
      }
    }, 1000);
  }
}
