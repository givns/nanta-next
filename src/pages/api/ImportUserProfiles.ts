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
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  );

  // If it's an OPTIONS request, send a 200 status
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    console.log('Parsed CSV data:', records); // Log the parsed data

    const importResults = {
      total: records.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const record of records) {
      try {
        if (!record.employeeId) {
          throw new Error('Employee ID is missing');
        }

        const employeeType = mapEmployeeType(record.type);
        const isGovernmentRegistered =
          record.registered.toLowerCase() === 'yes';

        const existingUser = await prisma.user.findUnique({
          where: { employeeId: record.employeeId },
        });

        const leaveBalances = existingUser
          ? {
              sickLeaveBalance: parseFloat(record.sickLeaveBalance) || 0,
              businessLeaveBalance:
                parseFloat(record.businessLeaveBalance) || 0,
              annualLeaveBalance: parseFloat(record.annualLeaveBalance) || 0,
            }
          : calculateLeaveBalances(employeeType);

        await prisma.user.upsert({
          where: { employeeId: record.employeeId },
          update: {
            name: record.name,
            nickname: record.nickname || null,
            department: { connect: { name: record.department } },
            role: record.role,
            company: record.company,
            employeeType,
            isGovernmentRegistered,
            ...leaveBalances,
            isPreImported: true,
            isRegistrationComplete: true,
          },
          create: {
            employeeId: record.employeeId,
            name: record.name,
            nickname: record.nickname || null,
            department: { connect: { name: record.department } },
            role: record.role,
            company: record.company,
            employeeType,
            isGovernmentRegistered,
            ...leaveBalances,
            isPreImported: true,
            isRegistrationComplete: true,
          },
        });
        importResults.success++;
      } catch (error) {
        importResults.failed++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        importResults.errors.push(
          `Error importing ${record.employeeId}: ${errorMessage}`,
        );
        console.error(`Failed to import ${record.employeeId}:`, error);
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
        annualLeaveBalance: 3,
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
