// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export { ChatsProvider, useChats } from './ChatSessionsContext'
export type { ChatSession } from './ChatSessionsContext'
export {
  beginLiveSegment,
  appendLiveContent,
  appendLiveReasoning,
  setLiveTools,
  setLiveUsage,
  setLiveDuration,
  getLiveSnapshot,
  hasLiveSegment,
  commitLiveSegment,
  clearLiveSegment,
  subscribeToLiveStream
} from './liveStream'
export type { LiveSegmentInit } from './liveStream'
