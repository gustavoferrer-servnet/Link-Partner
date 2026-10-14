import { CarrierRedundancyUnavailable } from '../services/carrierRedundancy.js';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { CoverageConflict } from '../services/coverageVersions.js';
import { CoverageUploadInvalid } from '../services/coverageUpload.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 'error', message: 'La ruta solicitada no existe.' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof CarrierRedundancyUnavailable) { res.status(409).json({ status: 'error', message: error.message }); return; }
  if (error instanceof CoverageConflict) { res.status(409).json({ status: 'error', code: 'COVERAGE_REVISION_CONFLICT', message: error.message }); return; }
  if (error instanceof CoverageUploadInvalid) { res.status(422).json({ status: 'error', message: error.message }); return; }
  console.error(error instanceof Error ? error.message : 'Unexpected error');
  res.status(500).json({ status: 'error', message: 'Ocurrió un error inesperado.' });
};
