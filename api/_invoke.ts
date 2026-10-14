import app from '../server';

// Vercel may invoke a file-based function with a shortened internal URL.
// Restore the Express route path so the existing server routes match reliably.
export function invokeExpress(req: any, res: any, routePath: string) {
  const rawUrl = typeof req.url === 'string' ? req.url : '';
  const query = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
  req.url = routePath + query;
  return app(req, res);
}
