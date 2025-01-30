// services/location/LocationAssistanceService.ts

import { PrismaClient, Prisma } from '@prisma/client';
import { NotificationService } from '../NotificationService';
import {
  LocationAssistanceCreateInput,
  LocationAssistanceVerificationInput,
  LocationAssistanceRejectionInput,
  LocationAssistanceRequest,
  LocationCoordinates,
  LocationAssistanceStatus,
} from '@/types/attendance';

export class LocationAssistanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService: NotificationService,
  ) {}

  // Helper method to transform Prisma Json to LocationCoordinates
  private transformCoordinates(
    coordinates: Prisma.JsonValue | null,
  ): LocationCoordinates | null {
    if (!coordinates || typeof coordinates !== 'object') return null;
    const coords = coordinates as Record<string, any>;
    if (!coords.lat || !coords.lng) return null;

    return {
      lat: Number(coords.lat),
      lng: Number(coords.lng),
      accuracy: coords.accuracy ? Number(coords.accuracy) : undefined,
    };
  }

  // Helper method to transform LocationCoordinates to Prisma Json
  private serializeCoordinates(
    coordinates?: LocationCoordinates | null,
  ): Prisma.JsonValue | null {
    if (!coordinates) return null;
    return {
      lat: coordinates.lat,
      lng: coordinates.lng,
      ...(coordinates.accuracy && { accuracy: coordinates.accuracy }),
    };
  }

  // Helper to transform Prisma result to our type
  private transformToLocationRequest(
    prismaResult: any,
    includeRelations: boolean = false,
  ): LocationAssistanceRequest {
    return {
      ...prismaResult,
      coordinates: this.transformCoordinates(prismaResult.coordinates),
      status: prismaResult.status as LocationAssistanceStatus,
      ...(includeRelations && {
        employee: prismaResult.employee,
        verifier: prismaResult.verifier,
      }),
    };
  }

  async createRequest(
    input: LocationAssistanceCreateInput,
  ): Promise<LocationAssistanceRequest> {
    const request = await this.prisma.locationAssistanceRequest.create({
      data: {
        employeeId: input.employeeId,
        coordinates: this.serializeCoordinates(
          input.coordinates,
        ) as Prisma.JsonValue,
        address: input.address || '',
        accuracy: input.accuracy,
        status: 'PENDING',
        reason: input.reason || null,
        source: input.source || 'mobile-app',
        metadata: input.metadata || {},
      },
      include: {
        employee: true,
      },
    });

    const transformedRequest = this.transformToLocationRequest(request, true);

    // Notify admins
    if (transformedRequest.employee?.lineUserId) {
      const admins = await this.prisma.user.findMany({
        where: {
          role: {
            in: ['Admin', 'SuperAdmin'],
          },
        },
      });

      console.log(
        'Found admins:',
        admins.map((a) => ({
          id: a.id,
          role: a.role,
          hasLineId: Boolean(a.lineUserId),
        })),
      );

      // Send notifications to all admins
      for (const admin of admins) {
        console.log('Sending notification to admin:', {
          adminId: admin.id,
          lineUserId: admin.lineUserId,
        });
        if (admin.lineUserId) {
          const notificationRequest = {
            ...transformedRequest,
            coordinates: this.serializeCoordinates(
              transformedRequest.coordinates,
            ),
          };

          const result = await this.notificationService.sendLocationRequest(
            transformedRequest.employeeId,
            admin.lineUserId,
            notificationRequest,
          );
          console.log('Notification result for admin:', {
            adminId: admin.id,
            result,
          });
        }
      }
    }

    return transformedRequest;
  }

  async approveRequest(
    requestId: string,
    input: LocationAssistanceVerificationInput,
  ): Promise<LocationAssistanceRequest> {
    const request = await this.prisma.locationAssistanceRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        verifiedAt: input.verifiedAt || new Date(),
        verifiedBy: input.verifiedBy,
        verificationNote: input.verificationNote,
      },
      include: {
        employee: true,
        verifier: true,
      },
    });

    const transformedRequest = this.transformToLocationRequest(request, true);

    // Notify employee
    if (transformedRequest.employee?.lineUserId) {
      await this.notificationService.sendNotification(
        transformedRequest.employeeId,
        transformedRequest.employee.lineUserId,
        {
          type: 'text',
          text: `✅ ตำแหน่งของคุณได้รับการอนุมัติ${input.verificationNote ? `\nหมายเหตุ: ${input.verificationNote}` : ''}`,
        },
        'location-assistance',
      );
    }

    return transformedRequest;
  }

  async rejectRequest(
    requestId: string,
    input: LocationAssistanceRejectionInput,
  ): Promise<LocationAssistanceRequest> {
    const request = await this.prisma.locationAssistanceRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        verifiedAt: input.verifiedAt || new Date(),
        verifiedBy: input.verifiedBy,
        rejectionReason: input.rejectionReason,
      },
      include: {
        employee: true,
        verifier: true,
      },
    });

    const transformedRequest = this.transformToLocationRequest(request, true);

    // Notify employee
    if (transformedRequest.employee?.lineUserId) {
      await this.notificationService.sendNotification(
        transformedRequest.employeeId,
        transformedRequest.employee.lineUserId,
        {
          type: 'text',
          text: `❌ ตำแหน่งของคุณไม่ได้รับการอนุมัติ${input.rejectionReason ? `\nเหตุผล: ${input.rejectionReason}` : ''}\nกรุณาลองใหม่อีกครั้ง`,
        },
        'location-assistance',
      );
    }

    return transformedRequest;
  }

  async getPendingRequests(): Promise<LocationAssistanceRequest[]> {
    const requests = await this.prisma.locationAssistanceRequest.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        employee: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return requests.map((request) =>
      this.transformToLocationRequest(request, true),
    );
  }

  async getRequestById(id: string): Promise<LocationAssistanceRequest | null> {
    const request = await this.prisma.locationAssistanceRequest.findUnique({
      where: { id },
      include: {
        employee: true,
        verifier: true,
      },
    });

    return request ? this.transformToLocationRequest(request, true) : null;
  }

  async getEmployeeHistory(
    employeeId: string,
  ): Promise<LocationAssistanceRequest[]> {
    const requests = await this.prisma.locationAssistanceRequest.findMany({
      where: { employeeId },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    return requests.map((request) => this.transformToLocationRequest(request));
  }

  private toJsonCoordinates(
    coordinates: LocationCoordinates | null,
  ): Record<string, number> | null {
    if (!coordinates) return null;
    return {
      lat: coordinates.lat,
      lng: coordinates.lng,
      ...(coordinates.accuracy !== undefined
        ? { accuracy: coordinates.accuracy }
        : {}),
    };
  }
}
