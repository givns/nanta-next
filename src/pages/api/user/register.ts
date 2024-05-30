import type { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '../../../lib/mongodb';
import User from '../../../models/User';
import { 
  createRichMenu, 
  linkRichMenuToUser, 
  uploadRichMenuImage, 
  generalUserRichMenu, 
  specialUserRichMenu, 
  adminRichMenu, 
  superAdminRichMenu 
} from '../../../utils/richMenus';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method } = req;

  await connectToDatabase();

  switch (method) {
    case 'POST':
      try {
        const { lineUserId, name, nickname, department, employeeNumber } = req.body;

        if (!lineUserId || !name || !department || !employeeNumber) {
          return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        let user = await User.findOne({ lineUserId });

        if (user) {
          return res.status(400).json({ success: false, message: 'User already exists' });
        }

        user = await User.create({
          lineUserId,
          name,
          nickname,
          department,
          employeeNumber,
          role: 'general' // Set default role to 'general'
        });

        // Check if this is the first user to register
        const userCount = await User.countDocuments({});
        if (userCount === 1) {
          user.role = 'super-admin';
          await user.save();
        }

        // Create and upload rich menu image
        let richMenuId;
        switch (user.role) {
          case 'super-admin':
            richMenuId = await createRichMenu(superAdminRichMenu);
            console.log('Super Admin Rich Menu ID:', richMenuId);
            await uploadRichMenuImage(richMenuId, 'public/images/richmenus/SuperAdmin.jpeg');
            break;
          case 'admin':
            richMenuId = await createRichMenu(adminRichMenu);
            console.log('Admin Rich Menu ID:', richMenuId);
            await uploadRichMenuImage(richMenuId, 'public/images/richmenus/Admin.jpeg');
            break;
          case 'special':
            richMenuId = await createRichMenu(specialUserRichMenu);
            console.log('Special User Rich Menu ID:', richMenuId);
            await uploadRichMenuImage(richMenuId, 'public/images/richmenus/SpecialUser.jpeg');
            break;
          default:
            richMenuId = await createRichMenu(generalUserRichMenu);
            console.log('General User Rich Menu ID:', richMenuId);
            await uploadRichMenuImage(richMenuId, 'public/images/richmenus/GeneralUser.jpeg');
        }

        // Link rich menu to user
        await linkRichMenuToUser(user.lineUserId, richMenuId);

        return res.status(201).json({ success: true, data: user });
      } catch (error: any) {
        console.error('Error creating rich menu or registering user:', error.response?.data || error.message);
        return res.status(400).json({ success: false, message: error.message });
      }
    default:
      return res.status(400).json({ success: false, message: 'Invalid method' });
  }
};

export default handler;