// pages/api/uploadCroppedProfilePicture.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Error parsing form data' });
      }

      const file = files.image as any;
      const employeeId = Array.isArray(fields.employeeId)
        ? fields.employeeId[0]
        : fields.employeeId;

      if (!file || !employeeId) {
        return res.status(400).json({ error: 'Missing file or employee ID' });
      }

      // Generate a unique filename
      const filename = `${uuidv4()}${path.extname(file.originalFilename || '')}`;

      // Define the path where the image will be saved
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      const filePath = path.join(uploadDir, filename);

      // Ensure the upload directory exists
      await fs.mkdir(uploadDir, { recursive: true });

      // Move the uploaded file to the destination
      const data = await fs.readFile(file.filepath);
      await fs.writeFile(filePath, data);
      await fs.unlink(file.filepath);

      // Generate the URL for the uploaded image
      const imageUrl = `/uploads/${filename}`;

      // Update the user's profile in the database
      const updatedUser = await prisma.user.update({
        where: { employeeId },
        data: { profilePictureUrl: imageUrl },
      });

      res.status(200).json({ success: true, imageUrl, user: updatedUser });
    });
  } catch (error) {
    console.error('Error uploading cropped image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
