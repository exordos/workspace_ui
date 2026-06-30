export class WorkspaceApiHttpError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "WorkspaceApiHttpError";
    this.status = status;
    this.data = data;
  }
}
