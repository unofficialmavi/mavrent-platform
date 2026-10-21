import { invokeExpress } from '../serverless/invoke';

export default function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed on /api/health. Expected GET.`,
    });
  }
  return invokeExpress(req, res, '/api/health');
}
