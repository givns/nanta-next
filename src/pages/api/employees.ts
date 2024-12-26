// pages/api/employees.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance';

// Initialize Prisma client
const prisma = new PrismaClient();

// Define the services type
type InitializedServices = Awaited<ReturnType<typeof initializeServices>>;

// Cache the services initialization promise
let servicesPromise: Promise<InitializedServices> | null = null;

// Initialize services once
const getServices = async (): Promise<InitializedServices> => {
  if (!servicesPromise) {
    servicesPromise = initializeServices(prisma);
  }

  const services = await servicesPromise;
  if (!services) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to initialize services',
    });
  }

  return services;
};

// Initialize services at startup
let services: InitializedServices;
getServices()
  .then((s) => {
    services = s;
  })
  .catch((error) => {
    console.error('Failed to initialize services:', error);
    process.exit(1); // Exit if services can't be initialized
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: { department: true },
    });

    if (!user) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let employees;

    if (user.role === 'Manager') {
      // Fetch only employees from the manager's department
      employees = await prisma.user.findMany({
        where: {
          role: 'Employee',
          departmentId: user.departmentId,
        },
        select: {
          id: true,
          name: true,
          employeeId: true,
          departmentName: true,
          shiftCode: true,
        },
      });
    } else if (user.role === 'Admin' || user.role === 'SuperAdmin') {
      // Fetch all employees grouped by department
      const departments = await prisma.department.findMany({
        include: {
          users: {
            where: { role: 'Employee' },
            select: {
              id: true,
              name: true,
              employeeId: true,
              departmentName: true,
              shiftCode: true,
            },
          },
        },
      });

      employees = departments.flatMap((dept) => dept.users);
    } else {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    // Fetch shift information for all employees
    const employeesWithShifts = await Promise.all(
      employees.map(async (emp) => {
        if (emp.shiftCode) {
          const shift = await services.shiftService.getShiftByCode(
            emp.shiftCode,
          );
          return { ...emp, shift };
        }
        return emp;
      }),
    );

    res.status(200).json(employeesWithShifts);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees' });
  }
}
