// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Cliente MCP — API pública + arranque. */

export { initMcpBridge, getMcpStatuses, syncMcpTools } from './bridge'
export {
  loadMcpConfig,
  readMcpConfig,
  writeMcpConfig,
  subscribeMcpConfig
} from './config'
export { mcpService, initMcp, reloadMcpConfig } from './service'
