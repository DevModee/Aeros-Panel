// Preloaded into the server under load (node --require) to track RSS without external tools.
// Samples every 250ms, prints every 5s. Heap is measured after a forced GC when --expose-gc is set,
// so a growing "heap" line across idle periods points at retained objects, not garbage.
const MB = 1024 * 1024;
let peak = 0;

setInterval(() => {
    const { rss } = process.memoryUsage();
    if (rss > peak) peak = rss;
}, 250).unref();

setInterval(() => {
    if (typeof global.gc === 'function') global.gc();
    const { rss, heapUsed } = process.memoryUsage();
    if (rss > peak) peak = rss;
    console.log(`[mem] rss=${(rss / MB).toFixed(1)}MB heap=${(heapUsed / MB).toFixed(1)}MB peak=${(peak / MB).toFixed(1)}MB`);
}, 5000).unref();
