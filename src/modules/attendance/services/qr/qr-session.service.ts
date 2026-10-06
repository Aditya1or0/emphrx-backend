import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RedisService } from '../../../../common/redis/redis.service.js';
import { CreateQrSessionDto, QrSessionResponseDto } from '../../dto/qr-session.dto.js';

interface QrTokenPayload {
  orgId: string;
  locationId: string;
  kioskIdentifier: string;
  nonce: string;
  issuedAt: number;
}

@Injectable()
export class QrSessionService {
  private readonly jwtSecret: string;
  private readonly ttlSeconds = 30;

  constructor(private readonly redisService: RedisService) {
    this.jwtSecret = process.env.QR_JWT_SECRET || 'emphrx_secure_qr_secret_key_default';
  }

  /* Generates short-lived dynamic token and persists ephemeral nonce in Redis */
  async createSession(orgId: string, dto: CreateQrSessionDto): Promise<QrSessionResponseDto> {
    const nonce = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const payload: QrTokenPayload = {
      orgId,
      locationId: dto.locationId,
      kioskIdentifier: dto.kioskIdentifier,
      nonce,
      issuedAt: now,
    };

    const qrToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: `${this.ttlSeconds}s`,
    });

    const nonceKey = `qr:nonce:${orgId}:${nonce}`;
    await this.redisService.setWithExpiry(nonceKey, dto.kioskIdentifier, this.ttlSeconds);

    return {
      qrToken,
      sessionId: nonce,
      expiresAt: expiresAt.toISOString(),
      refreshIntervalSeconds: this.ttlSeconds,
    };
  }

  /* Atomically validates and consumes the QR token nonce to prevent replay attacks */
  async validateAndConsumeToken(orgId: string, token: string): Promise<QrTokenPayload> {
    let payload: QrTokenPayload;

    try {
      payload = jwt.verify(token, this.jwtSecret) as QrTokenPayload;
    } catch {
      throw new UnauthorizedException('Dynamic QR token has expired or is invalid');
    }

    if (payload.orgId !== orgId) {
      throw new BadRequestException('QR token does not belong to this organization');
    }

    const nonceKey = `qr:nonce:${orgId}:${payload.nonce}`;
    const consumed = await this.redisService.consumeNonce(nonceKey);

    if (!consumed) {
      throw new BadRequestException('QR code has already been used or expired (replay prevented)');
    }

    return payload;
  }
}
