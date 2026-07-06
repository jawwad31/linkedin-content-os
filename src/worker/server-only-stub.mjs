// Stand-in for the "server-only" package when running under the plain-Node
// worker runtime (no Next.js bundler available to alias it away there). The
// worker process has no browser bundle to guard against, so this is safe —
// see ts-resolve-hook.mjs, which redirects the "server-only" specifier here
// only for this entry point.
export {};
