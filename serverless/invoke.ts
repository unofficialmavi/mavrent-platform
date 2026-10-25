import app from '../server';

// Normalize file-based Vercel function URLs and preserve pre-parsed bodies before dispatching to Express.
export function invokeExpress(req: any, res: any, routePath?: string) {
  if (routePath) {
    const rawUrl = typeof req.url === 'string' ? req.url : '';
    const query = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
    req.url = routePath + query;
    req.originalUrl = req.url;
  }

  // Serverless body parser bridge: if Vercel already consumed the stream and set req.body,
  // set req._body = true so express.json() / body-parser does not re-read the consumed stream.
  if (req.body !== undefined && req.body !== null) {
    req._body = true;
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // keep string
      }
    }
  }

  return (app as unknown as (request: any, response: any) => unknown)(req, res);
}
