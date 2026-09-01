export function emptyResponse(
  status: number,
  requestID: string,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-ID": requestID,
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  requestID: string,
  extraHeaders: HeadersInit = {},
): Response {
  return Response.json(
    { error: code, requestId: requestID },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestID,
        ...Object.fromEntries(new Headers(extraHeaders)),
      },
    },
  );
}
