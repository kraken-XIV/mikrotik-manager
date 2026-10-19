import { NextFunction, Request, Response } from 'express';

import { logSafe } from '../utils/logSafe';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error(
    '[HTTP request failed]',
    logSafe(req.method),
    logSafe(req.path),
    logSafe(err.message),
  );

  if (res.headersSent) return;

  const status = (err as { status?: number }).status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
