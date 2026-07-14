import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } });
}
