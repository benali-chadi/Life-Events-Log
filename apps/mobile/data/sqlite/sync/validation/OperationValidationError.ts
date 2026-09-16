export class OperationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationValidationError';
  }
}
