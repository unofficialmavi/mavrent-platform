import app from '../server';

export default function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return (app as unknown as (request: any, response: any) => unknown)(req, res);
}
