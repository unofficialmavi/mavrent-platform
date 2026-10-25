import { invokeExpress } from '../serverless/invoke';

export default function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return invokeExpress(req, res);
}
