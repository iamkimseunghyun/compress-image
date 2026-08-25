import os from 'node:os'

// Sharp's encoders run as libuv threadpool tasks, and that pool defaults to 4
// threads. imageProcessor's MAX_CONCURRENCY of 8 is therefore capped at 4 in
// practice — the extra workers just queue. Measured on a 16 x 4032x3024 batch
// (M-series, 10 cores) inside the packaged main process: 1457ms at the default
// pool size, 964ms once the pool is large enough for all 8 workers.
//
// The pool is created — and reads this variable — the first time a task is
// queued on it, not at require time. Electron's own startup does not queue one,
// so setting it here is early enough even though the bundler hoists the
// `require` calls above this line (verified in a packaged main process: the
// same 964ms whether the assignment runs before or after `require('electron')`).
// It stays the first import so the intent survives future bundler changes.
process.env.UV_THREADPOOL_SIZE ||= String(Math.max(8, os.cpus()?.length || 1))
