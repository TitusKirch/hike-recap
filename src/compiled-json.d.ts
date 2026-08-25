/**
 * `build/tours.compiled.json` is a build artefact, not a source file: it is
 * gitignored and only exists after `pnpm ingest`. Without this declaration a
 * typecheck on a fresh clone — CI above all — fails on the import in
 * `src/data.ts` rather than on anything a commit changed.
 *
 * The shape is deliberately `unknown`: `data.ts` casts it to `Compiled`, which
 * is the type that is actually checked. Inferring it from the JSON would only
 * describe whichever trip happened to be ingested last.
 */
declare module '*/build/tours.compiled.json' {
  const value: unknown;
  export default value;
}
