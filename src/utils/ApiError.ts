// legacy/ppangkal.md §12.0 공통 에러 응답 형식: { error: { code, message } }
export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message: string, code = 'INVALID_PARAMS'): ApiError {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = '인증이 필요합니다.'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }
}
