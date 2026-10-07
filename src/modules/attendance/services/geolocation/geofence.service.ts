import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceLocation } from '@prisma/client';
import { AttendanceLocationRepository } from '../../repositories/attendance-location.repository.js';

export interface GeofenceValidationResult {
  isWithinGeofence: boolean;
  distanceMeters: number;
  location: AttendanceLocation;
  isAccuracyAcceptable: boolean;
}

@Injectable()
export class GeofenceService {
  /* Reject or flag mobile GPS reads with accuracy radius exceeding 50 meters */
  private readonly maxAllowedAccuracyMeters = 50;

  constructor(
    private readonly locationRepository: AttendanceLocationRepository,
  ) {}

  /* Calculates great-circle distance between two geographic coordinates using Haversine formula */
  calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const earthRadiusMeters = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(earthRadiusMeters * c);
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /* Validates coordinates against a specific location or finds the nearest office */
  async validateCoordinates(
    orgId: string,
    latitude: number,
    longitude: number,
    accuracyMeters?: number,
    locationId?: string,
  ): Promise<GeofenceValidationResult> {
    let targetLocation: AttendanceLocation | null = null;

    if (locationId) {
      targetLocation = await this.locationRepository.findById(locationId);
      if (!targetLocation || targetLocation.orgId !== orgId) {
        throw new BadRequestException('Specified attendance location not found');
      }
    } else {
      /* Auto-detect nearest active worksite in the organization */
      const locations = await this.locationRepository.findActiveLocationsByOrg(orgId);
      if (locations.length === 0) {
        throw new BadRequestException('No active attendance locations configured for organization');
      }

      let minDistance = Number.POSITIVE_INFINITY;
      for (const loc of locations) {
        const dist = this.calculateDistanceMeters(
          latitude,
          longitude,
          loc.latitude,
          loc.longitude,
        );
        if (dist < minDistance) {
          minDistance = dist;
          targetLocation = loc;
        }
      }
    }

    if (!targetLocation) {
      throw new BadRequestException('Unable to resolve attendance location');
    }

    const distanceMeters = this.calculateDistanceMeters(
      latitude,
      longitude,
      targetLocation.latitude,
      targetLocation.longitude,
    );

    const isAccuracyAcceptable =
      accuracyMeters === undefined || accuracyMeters <= this.maxAllowedAccuracyMeters;

    const isWithinGeofence = distanceMeters <= targetLocation.radiusMeters;

    return {
      isWithinGeofence,
      distanceMeters,
      location: targetLocation,
      isAccuracyAcceptable,
    };
  }
}
