import app from '../server';

// Normalize file-based Vercel function URLs before dispatching to Express.
export function invokeExpress(req: any, res: any, routePath: string) {
  const rawUrl = typeof req.url === 'string' ? req.url : '';
  const query = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
  req.url = routePath + query;
  req.originalUrl = req.url;
  return (app as unknown as (request: any, response: any) => unknown)(req, res);
}
