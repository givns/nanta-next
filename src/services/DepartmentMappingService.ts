// services/DepartmentMappingService.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DepartmentMappingService {
  private departmentMap: Map<number, string> = new Map();

  async initialize() {
    const departments = await prisma.department.findMany();
    departments.forEach((dept) =>
      this.departmentMap.set(dept.externalId, dept.id),
    );
    console.log('Department mapping initialized');
  }

  getInternalId(externalId: number): string | undefined {
    return this.departmentMap.get(externalId);
  }

  getExternalId(internalId: string): number | undefined {
    for (const [extId, intId] of this.departmentMap.entries()) {
      if (intId === internalId) return extId;
    }
    return undefined;
  }
}

export const departmentMappingService = new DepartmentMappingService();
