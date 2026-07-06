export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
};

export type ApiFailure = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
};

export function apiSuccess<T>(data: T, init?: number | ResponseInit) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return Response.json(
    { success: true, data, error: null } satisfies ApiSuccess<T>,
    responseInit,
  );
}

export function apiFailure(
  code: string,
  message: string,
  init: number | ResponseInit = 400,
) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return Response.json(
    {
      success: false,
      data: null,
      error: { code, message },
    } satisfies ApiFailure,
    responseInit,
  );
}

const STATUS_BY_ERROR_CODE: Record<string, number> = {
  AUTH_REQUIRED: 401,
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE_INVITE: 409,
  RUN_IN_PROGRESS: 409,
  UNKNOWN_ERROR: 500,
};

export function statusForErrorCode(code: string): number {
  return STATUS_BY_ERROR_CODE[code] ?? 400;
}
