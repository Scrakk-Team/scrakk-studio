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
  it('usa el espacio SOBRE la píldora, no el de debajo', () => {
    // Dock pegado al fondo: anchor.bottom ≈ 40 → antes daba 120 (mínimo).
    expect(computePanelMaxHeight(40, 900)).toBe(836)
    // Dock a mitad de pantalla.
    expect(computePanelMaxHeight(300, 900)).toBe(576)
  })

  it('nunca baja del mínimo de 120px', () => {
    expect(computePanelMaxHeight(890, 900)).toBe(120)
  })

  it('sin ancla (medición inicial) usa 600', () => {
    expect(computePanelMaxHeight(null, 900)).toBe(600)
  })
})
