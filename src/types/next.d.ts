import { IUser } from '../models/User';

declare module 'next' {
  interface NextApiRequest {
    user?: IUser;
  }
}