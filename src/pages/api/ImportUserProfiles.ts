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
    bodyParser: {
      sizeLimit: '10mb',
    },
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

    console.log('Uploaded file:', file.originalname, file.mimetype, file.size);

    const csvData = file.buffer
      .toString('utf-8')
      .replace(/[^\x20-\x7E\n\r]/g, '');

    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    });

    console.log('Parsed records:', records);

    const importResults = {
      total: records.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    const CHUNK_SIZE = 10; // Adjust this value based on your needs
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      await processChunk(chunk, importResults);
    }

    console.log('Import results:', importResults);
    res
      .status(200)
      .json({ message: 'Import completed', results: importResults });
  } catch (error: any) {
    console.error('Error in import process:', error);
    res
      .status(500)
      .json({ message: 'Internal server error', error: error.message });
  }
}

async function processChunk(chunk: any[], importResults: any) {
  for (const record of chunk) {
    try {
      if (!record.employeeId || record.employeeId.trim() === '') {
        throw new Error('Employee ID is missing or empty');
      }

      await prisma.user.upsert({
        where: { employeeId: record.employeeId },
        update: {
          name: record.name,
          nickname: record.nickname || null,
          department: { connect: { name: record.department } },
          role: record.role,
          company: record.company,
          employeeType: mapEmployeeType(record.type),
          isGovernmentRegistered: record.registered.toLowerCase() === 'yes',
          sickLeaveBalance: parseFloat(record.sickLeaveBalance) || 0,
          businessLeaveBalance: parseFloat(record.businessLeaveBalance) || 0,
          annualLeaveBalance: parseFloat(record.annualLeaveBalance) || 0,
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
          employeeType: mapEmployeeType(record.type),
          isGovernmentRegistered: record.registered.toLowerCase() === 'yes',
          sickLeaveBalance: parseFloat(record.sickLeaveBalance) || 0,
          businessLeaveBalance: parseFloat(record.businessLeaveBalance) || 0,
          annualLeaveBalance: parseFloat(record.annualLeaveBalance) || 0,
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
}

function mapEmployeeType(type: string): EmployeeType {
  switch (type.toLowerCase()) {
    case 'full-time':
      return EmployeeType.FULL_TIME;
    case 'part-time':
      return EmployeeType.PART_TIME;
    case 'probation':
      return EmployeeType.PROBATION;
    default:
      throw new Error(`Invalid employee type: ${type}`);
  }
}
