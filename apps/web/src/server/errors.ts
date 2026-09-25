/** An error with an HTTP status, turned into a JSON response by `handle`. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
