import { createApp } from '../src/server/app.js';

/**
 * Vercel serverless entry: the same Express app the local server uses.
 * `vercel.json` rewrites every `/api/*` request here with the path preserved.
 *
 * Caveat: state (sessions, roasts, audio clips) lives in process memory, so it
 * is not shared between serverless invocations. Deploy the server as a
 * long-running service, or wire the Supabase stores described in docs/setup.md,
 * before relying on it for anything beyond a demo.
 */
const { app } = createApp();

export default app;
