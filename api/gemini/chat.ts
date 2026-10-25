import { invokeExpress } from '../../serverless/invoke';

export default function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed on /api/gemini/chat. Expected POST.`,
    });
  }
  return invokeExpress(req, res, '/api/gemini/chat');
}
