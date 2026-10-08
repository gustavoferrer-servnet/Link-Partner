import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Link Partner API listening on ${config.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, closing HTTP server`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
