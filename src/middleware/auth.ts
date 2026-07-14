import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function signUserToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '30d' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    next(ApiError.unauthorized());
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    req.userId = payload.sub as string;
    next();
  } catch {
    next(ApiError.unauthorized('토큰이 유효하지 않습니다.'));
  }
}
