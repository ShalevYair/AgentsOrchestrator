// This package's main entry — pure exports, zero side effects. Deliberately
// has no self-executing "run me" code: after P12-T1's `apps/cli` started
// bundling this module (esbuild) alongside its own entry, a self-execution
// guard here based on `import.meta.url === pathToFileURL(process.argv[1])`
// stopped working correctly — bundling collapses every originally-separate
// module's `import.meta.url` to the *bundle's own* file, so this module's
// guard fired a second time from inside someone else's bundle too, starting
// a second server with the wrong defaults. `bin.ts` (this package's actual
// process entry — see `package.json`'s `start`/`dev` scripts) has no such
// guard because it never needs one: unlike this file, it is never imported
// as a library by anything, only ever run directly.
export { startRuntime, type RunningRuntime, type StartRuntimeOptions } from "./start.js";
export { buildServer, type BuildServerOptions } from "./server.js";
export type { AppContext } from "./context.js";
