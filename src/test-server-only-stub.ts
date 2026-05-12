// Empty stub aliased in vitest.config.ts so `import "server-only"`
// inside keeper / API-route modules doesn't throw during unit tests.
//
// In production the real `server-only` package throws at module load
// when imported from a Client Component bundle; that protection is
// orthogonal to whether the module's pure functions are testable.
export {};
