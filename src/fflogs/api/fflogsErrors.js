/** Error thrown when an FFLogs request is missing usable authentication. */
export class FflogsAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "FflogsAuthError";
  }
}

/** Error thrown when the FFLogs HTTP response itself is unsuccessful. */
export class FflogsHttpError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "FflogsHttpError";
    this.status = status;
    this.payload = payload;
  }
}

/** Error thrown when FFLogs returns GraphQL-level errors. */
export class FflogsGraphqlError extends Error {
  constructor(message, { errors } = {}) {
    super(message);
    this.name = "FflogsGraphqlError";
    this.errors = errors || [];
  }
}

/** Error thrown when a request or response payload shape is invalid. */
export class FflogsPayloadError extends Error {
  constructor(message, { payload } = {}) {
    super(message);
    this.name = "FflogsPayloadError";
    this.payload = payload;
  }
}
