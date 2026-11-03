import type { Workspace } from '../workspace';

export type CompilerDiagnostic = {
  schema_version: number;
  severity: string;
  code: string | null;
  message: string;
  help?: string | null;
  primary?: {
    path: string;
    start: { line: number; column: number };
    end: { line: number; column: number };
  } | null;
};

export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  diagnostic?: CompilerDiagnostic | null;
};

export type RunRequest = { id: number; workspace: Workspace };
export type RunResponse = { id: number; result: RunResult };
