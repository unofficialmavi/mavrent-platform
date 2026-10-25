import app from '../server';

// Normalize file-based Vercel function URLs and preserve pre-parsed bodies before dispatching to Express.
// Returns a Promise that awaits the Express response completion so Vercel keeps the serverless lambda alive.
export function invokeExpress(req: any, res: any, explicitRoutePath?: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    // Ensure promise resolves when the response ends, closes, or errors
    res.once('finish', safeResolve);
    res.once('close', safeResolve);
    res.once('error', safeResolve);

    // 1. Determine target route path
    let targetPath = explicitRoutePath;
    const rawUrl = typeof req.url === 'string' ? req.url : '';
    const queryIndex = rawUrl.indexOf('?');
    const queryString = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
    const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;

    if (!targetPath) {
      // Check x-matched-path or x-vercel-matched-path (e.g. /api/data/portfolio)
      const matchedPath = req.headers?.['x-matched-path'] || req.headers?.['x-vercel-matched-path'];
      if (typeof matchedPath === 'string' && matchedPath.startsWith('/api')) {
        targetPath = matchedPath;
      } else if (req.query && req.query.path) {
        // Vercel [...path].ts populates req.query.path as array or string
        const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
        targetPath = '/api/' + parts.map(encodeURIComponent).join('/');
      } else if (pathname && pathname.startsWith('/api')) {
        targetPath = pathname;
      } else if (pathname && pathname !== '/' && !pathname.includes('[...path]')) {
        targetPath = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
      } else {
        targetPath = '/api';
      }
    }

    req.url = targetPath + queryString;
    req.originalUrl = req.url;

    // 2. Serverless body parser bridge: if Vercel already consumed the stream and set req.body,
    // set req._body = true so express.json() / body-parser does not re-read the consumed stream.
    if (req.body !== undefined && req.body !== null) {
      req._body = true;
      if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          // preserve raw string
        }
      }
    }

    // 3. Dispatch to Express app with callback safety
    try {
      (app as any)(req, res, (err: any) => {
        if (err && !res.headersSent) {
          const status = Number(err.status || err.statusCode) || 500;
          res.status(status).json({
            success: false,
            error: err.message || 'Internal Server Error',
          });
        }
        safeResolve();
      });
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: err.message || 'Internal Server Error',
        });
      }
      safeResolve();
    }
  });
}
