import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, EmployeeType } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import multer from 'multer';
import initMiddleware from '../../lib/init-middleware';

const prisma = new PrismaClient();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
  },
});

// Initialize multer middleware
const multerMiddleware = initMiddleware(upload.single('file'));

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await multerMiddleware(req, res);

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const csvData = file.buffer.toString();
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
    });

    const importResults = {
      total: records.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const record of records) {
      try {
        const employeeType = mapEmployeeType(record.Type);
        const isGovernmentRegistered =
          record.Registered.toLowerCase() === 'yes';

        const existingUser = await prisma.user.findUnique({
          where: { employeeId: record.employeeId },
        });

        const leaveBalances = existingUser
          ? {
              sickLeaveBalance: parseInt(record.sickLeaveBalance),
              businessLeaveBalance: parseInt(record.businessLeaveBalance),
              annualLeaveBalance: parseInt(record.annualLeaveBalance),
            }
          : calculateLeaveBalances(employeeType);

        await prisma.user.upsert({
          where: { employeeId: record.employeeId },
          update: {
            name: record.name,
            nickname: record.nickname,
            department: { connect: { name: record.department } },
            role: record.role,
            company: record.Company,
            employeeType,
            isGovernmentRegistered,
            isPreImported: true,
            ...leaveBalances,
          },
          create: {
            employeeId: record.employeeId,
            name: record.name,
            nickname: record.nickname,
            department: { connect: { name: record.department } },
            role: record.role,
            company: record.Company,
            employeeType,
            isGovernmentRegistered,
            isPreImported: true,
            assignedShift: { connect: { shiftCode: 'DEFAULT' } },
            ...leaveBalances,
          },
        });
        importResults.success++;
      } catch (error: any) {
        importResults.failed++;
        importResults.errors.push(
          `Error importing ${record.employeeId}: ${error.message}`,
        );
      }
    }

    res
      .status(200)
      .json({ message: 'Import completed', results: importResults });
  } catch (error: any) {
    console.error('Error importing user profiles:', error);
    res
      .status(500)
      .json({ message: 'Internal server error', error: error.message });
  }
}

function mapEmployeeType(type: string): EmployeeType {
  switch (type.toLowerCase()) {
    case 'full-time':
      return EmployeeType.FULL_TIME;
    case 'part-time':
      return EmployeeType.PART_TIME;
    case 'probation':
    default:
      return EmployeeType.PROBATION;
  }
}

function calculateLeaveBalances(type: EmployeeType) {
  switch (type) {
    case EmployeeType.FULL_TIME:
      return {
        sickLeaveBalance: 30,
        businessLeaveBalance: 3,
        annualLeaveBalance: 6,
      };
    case EmployeeType.PART_TIME:
      return {
        sickLeaveBalance: 30,
        businessLeaveBalance: 3,
        annualLeaveBalance: 6,
      };
    case EmployeeType.PROBATION:
    default:
      return {
        sickLeaveBalance: 0,
        businessLeaveBalance: 0,
        annualLeaveBalance: 0,
      };
  }
}