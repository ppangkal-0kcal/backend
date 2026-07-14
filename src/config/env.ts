function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/ppangkal'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  tourApi: {
    // 한국관광공사 국문 관광정보 서비스_GW — 서비스키는 공공데이터포털에서 발급.
    baseUrl: process.env.TOUR_API_BASE_URL ?? 'https://apis.data.go.kr/B551011/KorService2',
    serviceKey: process.env.TOUR_API_SERVICE_KEY ?? '',
  },
  kakao: {
    restApiKey: process.env.KAKAO_REST_API_KEY ?? '',
  },
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  },
};
