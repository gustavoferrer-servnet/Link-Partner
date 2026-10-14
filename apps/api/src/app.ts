import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { customerRouter } from './routes/customers.js';
import { cxRouter } from './routes/cx.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Origin not allowed'));
  },
  credentials: false,
}));
app.use(express.json({ limit: '30mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'link-partner-api', version: '0.3.0' });
});
app.use('/api/v1/customers', customerRouter);
app.use('/api/v1', cxRouter);
app.use('/api/v1', apiRouter);
app.use(notFound);
app.use(errorHandler);
