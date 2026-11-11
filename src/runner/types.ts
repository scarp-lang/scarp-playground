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

export type RunRequest = { id: number; workspace: Workspace; mode: 'run' | 'check'; stdin?: string };
export type RunResponse = { id: number; result: RunResult };
export type DefinitionRequest = { id: number; workspace: Workspace; mode: 'definition'; path: string; offset: number };
export type DefinitionResponse = { id: number; definition: import('../navigation/protocol').DefinitionResult };

export type ReferencesRequest = { id: number; workspace: Workspace; mode: 'references'; path: string; offset: number };
export type ReferencesResponse = { id: number; references: import('../navigation/references').ReferenceResult };

export type RenameRequest = { id: number; workspace: Workspace; mode: 'rename';
  path: string; offset: number; new_name: string };
export type RenameResponse = { id: number; rename: import('../navigation/rename').RenameResult };
