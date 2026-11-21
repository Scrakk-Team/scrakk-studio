// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Regresión: el panel flotante del ToolDock debe poder crecer hacia arriba
 * incluso cuando el dock está pegado al fondo del viewport.
 */

import { describe, expect, it } from 'vitest'
import { computePanelMaxHeight } from '../src/renderer/src/features/tooldock/toolDockGeometry'

describe('computePanelMaxHeight', () => {
  it('usa el espacio SOBRE la píldora, pero nunca más del 60% del viewport', () => {
    // Dock pegado al fondo: espacio libre arriba ≈ 836, pero el cap da 540.
    expect(computePanelMaxHeight(40, 900)).toBe(540)
    // Dock a mitad de pantalla: 576 → también limitado a 540.
    expect(computePanelMaxHeight(300, 900)).toBe(540)
  })

  it('nunca baja del mínimo de 120px', () => {
    expect(computePanelMaxHeight(890, 900)).toBe(120)
  })

  it('sin ancla (medición inicial) respeta el cap', () => {
    expect(computePanelMaxHeight(null, 900)).toBe(540)
  })
})
