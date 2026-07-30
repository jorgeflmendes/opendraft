// Service-layer errors. Co-located here rather than in domain/ because
// they are concerns of the *service contract*, not the data model.

export class ProjectNotFoundError extends Error {
  /** The id that was requested. */
  readonly id: string;

  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
    this.id = id;
  }
}
