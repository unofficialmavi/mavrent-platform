import { invokeExpress } from '../../serverless/invoke';
export default function handler(req: any, res: any) { return invokeExpress(req, res, '/api/data/notifications'); }
