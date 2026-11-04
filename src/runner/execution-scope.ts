/**
 * A run result belongs to exactly one version of the editable workspace.
 * Changes invalidate older results and abort the corresponding disposable
 * compiler worker. This is separate from the interpreter's resource limits.
 */
export type ActiveExecution = { generation: number; controller: AbortController };

export class ExecutionScope {
  private generation = 0;
  private active: ActiveExecution | null = null;

  get running(): boolean {
    return this.active !== null;
  }

  start(): ActiveExecution | null {
    if (this.active) return null;
    const execution = { generation: ++this.generation, controller: new AbortController() };
    this.active = execution;
    return execution;
  }

  invalidate(): void {
    ++this.generation;
    this.active?.controller.abort();
    this.active = null;
  }

  isCurrent(execution: ActiveExecution): boolean {
    return this.active === execution &&
      execution.generation === this.generation &&
      !execution.controller.signal.aborted;
  }

  finish(execution: ActiveExecution): boolean {
    if (!this.isCurrent(execution)) return false;
    this.active = null;
    return true;
  }
}
