import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: '빵칼(0-kcal) API',
      version: '0.1.0',
      description: '대전 빵집/칼로리 밸런스/관광 코스 추천 API — legacy/ppangkal.md §4.3, §12 계약 기준.',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.routes.{ts,js}').split(path.sep).join('/')],
};

export const swaggerSpec = swaggerJsdoc(options);
