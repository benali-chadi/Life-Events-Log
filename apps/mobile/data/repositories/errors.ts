import type { UUID } from '@/models';

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class EntityNotFoundError extends RepositoryError {
  constructor(entityName: string, id: UUID) {
    super(`${entityName} with ID “${id}” was not found.`);
    this.name = 'EntityNotFoundError';
  }
}

export class DuplicateNameError extends RepositoryError {
  constructor(entityName: string, name: string) {
    super(`${entityName} named “${name}” already exists.`);
    this.name = 'DuplicateNameError';
  }
}

export class ModelValidationError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'ModelValidationError';
  }
}
