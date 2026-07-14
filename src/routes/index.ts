import { Router } from 'express';
import { authRouter } from './auth.routes';
import { usersRouter } from './users.routes';
import { bakeriesRouter } from './bakeries.routes';
import { tourRouter } from './tour.routes';
import { routeRouter } from './route.routes';
import { caloriesRouter } from './calories.routes';
import { foodLogsRouter } from './foodLogs.routes';
import { statsRouter } from './stats.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/bakeries', bakeriesRouter);
apiRouter.use('/tour', tourRouter);
apiRouter.use('/routes', routeRouter);
apiRouter.use('/calories', caloriesRouter);
apiRouter.use('/food-logs', foodLogsRouter);
apiRouter.use('/stats', statsRouter);
