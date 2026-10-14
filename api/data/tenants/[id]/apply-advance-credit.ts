import { invokeExpress } from '../../../_invoke';
export default function handler(req: any, res: any) { const raw = req.query?.id; const id = Array.isArray(raw) ? raw[0] : raw; if (!id) return res.status(400).json({ error: 'Missing tenant id' }); return invokeExpress(req, res, '/api/data/tenants/' + encodeURIComponent(String(id)) + '/apply-advance-credit'); }
