import { describe, expect, it } from 'vitest';
import { filterCommands, selectedCommand, stepCommand, type WorkspaceCommand } from '../src/command-palette';

const commands: WorkspaceCommand[] = [
  { id: 'run', label: 'Run code', group: 'Execution', description: 'Execute program', shortcut: 'Ctrl+Enter', invoke() {} },
  { id: 'verify', label: 'Verify code', group: 'Execution', description: 'Parse and type-check', invoke() {} },
  { id: 'stop', label: 'Stop execution', group: 'Execution', description: 'Cancel worker', disabled: true, invoke() {} },
  { id: 'import', label: 'Import project', group: 'Project', description: 'Read local JSON', keywords: ['open'], invoke() {} },
];

describe('command search and selection', () => {
  it('preserves registry order without a query', () => expect(filterCommands(commands, '  ')).toEqual(commands));
  it('ranks exact labels, prefixes and metadata matches without mutating the registry', () => {
    expect(filterCommands(commands, 'RUN CODE').map(item => item.id)).toEqual(['run']);
    expect(filterCommands(commands, 'code').map(item => item.id)).toEqual(['run', 'verify']);
    expect(filterCommands(commands, 'execution cancel').map(item => item.id)).toEqual(['stop']);
    expect(filterCommands(commands, 'open json').map(item => item.id)).toEqual(['import']);
    expect(filterCommands(commands, 'unknown')).toEqual([]);
  });
  it('skips unavailable actions and wraps in both directions', () => {
    expect(stepCommand(commands, 'verify', 1)).toBe('import');
    expect(stepCommand(commands, 'import', 1)).toBe('run');
    expect(stepCommand(commands, 'run', -1)).toBe('import');
    expect(stepCommand(commands, null, -1)).toBe('import');
    expect(stepCommand([commands[2]], null, 1)).toBeNull();
    expect(selectedCommand(commands, 'stop')?.id).toBe('run');
    expect(selectedCommand([], 'run')).toBeUndefined();
  });
});
