import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 'error', message: 'La ruta solicitada no existe.' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error instanceof Error ? error.message : 'Unexpected error');
  res.status(500).json({ status: 'error', message: 'Ocurrió un error inesperado.' });
};
