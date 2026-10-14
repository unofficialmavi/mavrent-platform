// Route all /api/* requests through the shared Express API application.
// server.ts skips app.listen() when running in Vercel's serverless runtime.
import app from '../server';

export default app;
