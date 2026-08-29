import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';

const { app, config, providers } = createApp();

// Serve the built prototype UI in production (`npm run build && npm start`).
const webDist = path.resolve(process.cwd(), 'dist/web');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
}

app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  console.log(
    `[api] providers -> elevenlabs: ${providers.elevenlabs}, healf: ${providers.healf}, poke: ${providers.poke}`,
  );
});
