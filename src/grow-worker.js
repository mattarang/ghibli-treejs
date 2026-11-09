// The worker that grows the trees and bushes (src/grow.js) off the page's thread, so the scene keeps drawing while a tree grows. Only the
// newest request matters: requests that arrive while one is growing replace each other, and only the last is grown next.
import { growScene, packScene, transfers } from './grow.js'

let next = null, busy = false
self.onmessage = e => { next = e.data; if (!busy){ busy = true; setTimeout(run) } }   // a turn of the queue first, so a burst collapses to its last
function run(){
  const job = next; next = null
  const t0 = performance.now(), r = packScene(growScene(job.p, job.opts))
  r.id = job.id; r.preview = !!job.opts?.preview; r.ms = performance.now() - t0
  self.postMessage(r, transfers(r))
  if (next) setTimeout(run); else busy = false
}
