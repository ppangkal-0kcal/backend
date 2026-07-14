import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4는 async 핸들러의 reject를 자동으로 next()에 넘기지 않으므로 래핑한다.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
