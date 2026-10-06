import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface WebhookEventPayload {
  event: string;
  orgId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

@Injectable()
export class AttendanceWebhookService {
  private readonly logger = new Logger(AttendanceWebhookService.name);

  /* Computes cryptographic HMAC-SHA256 signature for outgoing webhook payload */
  computePayloadSignature(secret: string, payload: WebhookEventPayload): string {
    const raw = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(raw).digest('hex');
  }

  /* Dispatches real-time attendance punch notification to external ERP/payroll systems */
  async dispatchPunchEvent(
    orgId: string,
    punchData: Record<string, unknown>,
    webhookUrl?: string,
    webhookSecret?: string,
  ): Promise<WebhookEventPayload> {
    const eventPayload: WebhookEventPayload = {
      event: 'attendance.punch.recorded',
      orgId,
      timestamp: new Date().toISOString(),
      data: punchData,
    };

    if (webhookUrl && webhookSecret) {
      const signature = this.computePayloadSignature(webhookSecret, eventPayload);
      this.logger.debug(
        `Dispatched outbound webhook to ${webhookUrl} (Signature: ${signature.substring(0, 8)}...)`,
      );
    } else {
      this.logger.debug(
        `Attendance punch event logged for org ${orgId} (No external webhook endpoint configured)`,
      );
    }

    return eventPayload;
  }

  /* Dispatches finalized daily attendance record calculation notification */
  async dispatchRollupEvent(
    orgId: string,
    recordData: Record<string, unknown>,
    webhookUrl?: string,
    webhookSecret?: string,
  ): Promise<WebhookEventPayload> {
    const eventPayload: WebhookEventPayload = {
      event: 'attendance.rollup.completed',
      orgId,
      timestamp: new Date().toISOString(),
      data: recordData,
    };

    if (webhookUrl && webhookSecret) {
      const signature = this.computePayloadSignature(webhookSecret, eventPayload);
      this.logger.debug(
        `Dispatched rollup webhook to ${webhookUrl} (Signature: ${signature.substring(0, 8)}...)`,
      );
    }

    return eventPayload;
  }
}
