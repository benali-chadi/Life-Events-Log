export class InMemorySeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InMemorySeedError';
  }
}
