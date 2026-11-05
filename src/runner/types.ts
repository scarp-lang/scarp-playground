import type { Workspace } from '../workspace';

export type DiagnosticPosition = { line: number; column: number };

export type DiagnosticLocation = {
  path: string;
  span?: [number, number];
  start: DiagnosticPosition;
  end: DiagnosticPosition;
};

export type CompilerDiagnostic = {
  schema_version: number;
  severity: string;
  code: string | null;
  message: string;
  span_encoding?: string;
  column_encoding?: string;
  position_base?: number;
  help?: string | null;
  primary?: DiagnosticLocation | null;
  related?: Array<{ message: string; location: DiagnosticLocation | null }>;
};

export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  diagnostic?: CompilerDiagnostic | null;
};

export type RunRequest = { id: number; workspace: Workspace; mode: 'run' | 'check' };
export type RunResponse = { id: number; result: RunResult };
