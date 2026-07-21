import { Router } from 'express';
import { authRouter } from './auth.routes';
import { usersRouter } from './users.routes';
import { bakeriesRouter } from './bakeries.routes';
import { tourRouter } from './tour.routes';
import { toursRouter } from './tours.routes';
import { caloriesRouter } from './calories.routes';
import { foodLogsRouter } from './foodLogs.routes';
import { statsRouter } from './stats.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/bakeries', bakeriesRouter);
// /tour = 한국관광공사 TourAPI 프록시(tour.routes.ts), /tours = 빵투어 세션(tours.routes.ts) — 이름이
// 비슷하지만 서로 다른 리소스이니 헷갈리지 말 것.
apiRouter.use('/tour', tourRouter);
apiRouter.use('/tours', toursRouter);
apiRouter.use('/calories', caloriesRouter);
apiRouter.use('/food-logs', foodLogsRouter);
apiRouter.use('/stats', statsRouter);
