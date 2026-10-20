import { createReadOnlyHandler } from '../shared/netease/readOnlyBackend.cjs';
// Path-discovered Node entry; uses the original pinned SDK, not an always-running server.
export default createReadOnlyHandler();
