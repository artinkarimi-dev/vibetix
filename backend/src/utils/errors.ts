export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (code: string, message: string, status = 409): never => {
  throw new AppError(status, code, message);
};
