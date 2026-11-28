export const MAX_COMMAND_QUERY = 120;
export type CommandGroup = 'Execution' | 'Navigation' | 'Project' | 'Editor' | 'Output' | 'View';
export type WorkspaceCommand = {
  id: string;
  label: string;
  group: CommandGroup;
  description: string;
  keywords?: readonly string[];
  shortcut?: string;
  disabled?: boolean;
  invoke: () => void;
};

const normalize = (value: string) => value.toLowerCase().trim().replace(/\s+/gu, ' ');

/** Match all query terms against descriptive metadata, preferring exact
 * command labels, prefixes and then matches in the label over aliases. */
export function filterCommands(commands: readonly WorkspaceCommand[], query: string): WorkspaceCommand[] {
  const needle = normalize(query.slice(0, MAX_COMMAND_QUERY));
  if (!needle) return [...commands];
  const terms = needle.split(' ');
  return commands.flatMap((command, index) => {
    const label = normalize(command.label);
    const metadata = normalize([command.label, command.group, command.description,
      command.shortcut ?? '', ...(command.keywords ?? [])].join(' '));
    if (!terms.every(term => metadata.includes(term))) return [];
    const score = label === needle ? 1000 : label.startsWith(needle) ? 500 :
      terms.every(term => label.includes(term)) ? 200 : terms.filter(term => label.includes(term)).length * 10;
    return [{ command, index, score }];
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.command);
}

/** Disabled commands remain discoverable but cannot become keyboard targets. */
export function stepCommand(commands: readonly WorkspaceCommand[], selected: string | null, delta: 1 | -1): string | null {
  const enabled = commands.filter(command => !command.disabled);
  if (!enabled.length) return null;
  const index = enabled.findIndex(command => command.id === selected);
  if (index === -1) return enabled[delta === 1 ? 0 : enabled.length - 1].id;
  return enabled[(index + delta + enabled.length) % enabled.length].id;
}

export function selectedCommand(commands: readonly WorkspaceCommand[], selected: string | null): WorkspaceCommand | undefined {
  return commands.find(command => command.id === selected && !command.disabled) ??
    commands.find(command => !command.disabled);
}
