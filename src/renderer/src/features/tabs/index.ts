// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export { tabsStore } from './store'
export type { TabsEvent } from './store'
export {
  welcomeTab,
  panelTab,
  fileTab,
  terminalTab,
  explorerTab,
  tabPersistsByDefault
} from './store'
export { TabStrip, MAX_STRIP_ACTIONS, type StripAction } from './TabStrip'
export {
  PREVIEW_STRIP_ID,
  mountPreviewStrip,
  unmountPreviewStrip
} from './previewStrip'
export {
  isTabsDocked,
  setTabsDocked,
  toggleTabsDocked,
  subscribeToTabsDocked,
  bindTabsDockedContext,
  TABS_DOCKED_CONTEXT_KEY
} from './dock'
export type { TabKind, TabSpec, StripId, StripState } from './types'
export {
  isTabWidthFixed,
  getTabWidth,
  setTabWidthFixed,
  setTabWidth,
  toggleTabWidthFixed,
  subscribeToTabWidth,
  clamp as clampTabWidth,
  TAB_WIDTH_MIN,
  TAB_WIDTH_MAX,
  TAB_WIDTH_DEFAULT
} from './tabSize'
export {
  tabHeaderKey,
  setTabHeader,
  getTabHeader,
  getTabTitle,
  subscribeTabHeaders,
  extractHeaderMenuItems,
  _resetTabHeadersForTests,
  type TabHeaderEntry
} from './tabHeaders'
