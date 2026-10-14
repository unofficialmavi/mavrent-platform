import { invokeExpress } from '../../../serverless/invoke';
export default function handler(req: any, res: any) { const raw = req.query?.id; const id = Array.isArray(raw) ? raw[0] : raw; if (!id) return res.status(400).json({ error: 'Missing maintenance id' }); return invokeExpress(req, res, '/api/data/maintenance/' + encodeURIComponent(String(id))); }
