// pages/api/admin/employees/bulk.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createNotificationService } from '@/services/NotificationService';

const prisma = new PrismaClient();
const notificationService = createNotificationService(prisma);

// Validation schema for bulk operations
const BulkOperationSchema = z.object({
  employeeIds: z
    .array(z.string())
    .min(1, 'At least one employee must be selected'),
  action: z.enum(['department', 'shift', 'delete', 'export']),
  value: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Validate admin access
    const admin = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true, employeeId: true },
    });

    if (!admin || !['Admin', 'SuperAdmin'].includes(admin.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Validate request body
    const validatedData = BulkOperationSchema.parse(req.body);
    const { employeeIds, action, value } = validatedData;

    // Execute bulk operation based on action type
    switch (action) {
      case 'department': {
        if (!value) {
          return res
            .status(400)
            .json({ error: 'Department value is required' });
        }

        // Verify department exists
        const department = await prisma.department.findFirst({
          where: { name: value },
        });

        if (!department) {
          return res.status(400).json({ error: 'Invalid department' });
        }

        // Update employees
        const updatedEmployees = await prisma.user.updateMany({
          where: { id: { in: employeeIds } },
          data: { departmentName: value },
        });

        // Send notifications
        const employees = await prisma.user.findMany({
          where: { id: { in: employeeIds } },
          select: { lineUserId: true, name: true },
        });

        for (const employee of employees) {
          if (employee.lineUserId) {
            await notificationService.sendNotification(
              employee.lineUserId,
              employee.name,
              `Your department has been updated to ${value}.`,
              'department_update',
            );
          }
        }

        return res.status(200).json({
          message: `Updated department for ${updatedEmployees.count} employees`,
          affected: updatedEmployees.count,
        });
      }

      case 'shift': {
        if (!value) {
          return res.status(400).json({ error: 'Shift code is required' });
        }

        // Verify shift exists
        const shift = await prisma.shift.findUnique({
          where: { shiftCode: value },
        });

        if (!shift) {
          return res.status(400).json({ error: 'Invalid shift code' });
        }

        // Update employees
        const updatedEmployees = await prisma.user.updateMany({
          where: { id: { in: employeeIds } },
          data: { shiftCode: value },
        });

        // Send notifications
        const employees = await prisma.user.findMany({
          where: { id: { in: employeeIds } },
          select: { lineUserId: true, name: true },
        });

        for (const employee of employees) {
          if (employee.lineUserId) {
            await notificationService.sendNotification(
              employee.lineUserId,
              employee.name,
              `Your shift has been updated to ${shift.name}.`,
              'shift_update',
            );
          }
        }

        return res.status(200).json({
          message: `Updated shift for ${updatedEmployees.count} employees`,
          affected: updatedEmployees.count,
        });
      }

      case 'delete': {
        // Ensure super admin for deletions
        if (admin.role !== 'SuperAdmin') {
          return res
            .status(403)
            .json({ error: 'Only Super Admins can delete employees' });
        }

        // Get employee data before deletion for logging
        const employeesToDelete = await prisma.user.findMany({
          where: { id: { in: employeeIds } },
          select: { name: true, employeeId: true },
        });

        // Perform deletion
        const deletedEmployees = await prisma.user.deleteMany({
          where: { id: { in: employeeIds } },
        });

        // Log deletion
        await prisma.auditLog.createMany({
          data: employeesToDelete.map((emp) => ({
            action: 'DELETE',
            entityType: 'USER',
            entityId: emp.employeeId,
            description: `Employee ${emp.name} deleted by ${admin.employeeId}`,
            performedBy: admin.employeeId,
          })),
        });

        return res.status(200).json({
          message: `Deleted ${deletedEmployees.count} employees`,
          affected: deletedEmployees.count,
        });
      }

      case 'export': {
        const employees = await prisma.user.findMany({
          where: { id: { in: employeeIds } },
          include: {
            department: true,
          },
        });

        // Transform data for export
        const exportData = employees.map((emp) => ({
          employeeId: emp.employeeId,
          name: emp.name,
          department: emp.departmentName,
          role: emp.role,
          employeeType: emp.employeeType,
          shiftCode: emp.shiftCode,
          workStartDate: emp.workStartDate,
          isGovernmentRegistered: emp.isGovernmentRegistered,
        }));

        return res.status(200).json({
          message: 'Export data generated',
          data: exportData,
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Bulk operation error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message:
        error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
