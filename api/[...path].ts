import app from '../server';

// Keep a single Vercel Function for the Express API so the project fits
// Vercel Hobby's function-count limit. Express still owns authentication,
// authorization, validation, and all /api route handlers.
export default function handler(req: any, res: any) {
  const rawUrl = typeof req.url === 'string' ? req.url : '/api';
  const queryIndex = rawUrl.indexOf('?');
  const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';

  // Vercel catch-all routes normally retain the original /api/... URL.
  // Normalize defensively in case the runtime supplies only the catch-all suffix.
  const normalizedPath = pathname === '/api' || pathname.startsWith('/api/')
    ? pathname
    : `/api/${pathname.replace(/^\/+/, '')}`;

  req.url = normalizedPath + query;
  return (app as unknown as (request: any, response: any) => unknown)(req, res);
}
