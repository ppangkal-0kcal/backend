import { app } from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`빵칼 백엔드 서버 실행 중: http://localhost:${env.port}`);
});
