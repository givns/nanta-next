// src/pages/api/employees/index.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const employees = await prisma.user.findMany({
        include: {
          department: true,
          assignedShift: true,
        },
      });
      res.status(200).json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: 'Error fetching employees' });
    }
  } else if (req.method === 'POST') {
    try {
      const {
        name,
        nickname,
        departmentName,
        role,
        employeeType,
        isGovernmentRegistered,
        company,
        shiftCode,
      } = req.body;

      // Find the department by name
      const department = await prisma.department.findFirst({
        where: { name: departmentName },
      });

      if (!department) {
        return res.status(400).json({ error: 'Invalid department name' });
      }

      const newEmployee = await prisma.user.create({
        data: {
          employeeId: `E${uuidv4().substring(0, 4)}`,
          name,
          nickname,
          departmentName,
          department: {
            connect: { id: department.id },
          },
          role,
          employeeType,
          isGovernmentRegistered,
          company,
          shiftCode,
        },
      });

      res.status(201).json(newEmployee);
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({ error: 'Error creating employee' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
