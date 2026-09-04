/** `--tag=<tag>` (repeatable) narrows the run to cases carrying every named tag — the "cheap subset" knob P11-T5's CI cost-regression gate will need; not yet wired to any CI job here, this is just the filtering mechanism it will use. */
export function parseTagFilters(argv: readonly string[]): string[] {
  return argv
    .filter((arg) => arg.startsWith("--tag="))
    .map((arg) => arg.slice("--tag=".length))
    .filter((tag) => tag.length > 0);
}
