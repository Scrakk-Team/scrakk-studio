// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Preferencias experimentales de la Activity Bar (izquierda y derecha). */

export type { ActivityBarMode, DisabledActivitySide } from './types'
export {
  getActivityBarMode,
  setActivityBarMode,
  getDisabledActivitySide,
  setDisabledActivitySide,
  subscribeToActivityBarSettings,
  normalizeActivityBarMode,
  normalizeDisabledSide,
  _resetActivityBarSettingsForTests
} from './settings'
