// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Regresión de UX del panel de Git.
 *
 * Los dos botones tienen semántica distinta y correcta:
 *   - **Commit**: commitea sólo lo que está en el índice (`staged`), así que se
 *     deshabilita con `state.staged.length === 0`.
 *   - **Todo**: `git add -A` + commit en un paso.
 *
 * El problema era que el único camino para preparar archivos era
 * **seleccionarlos primero** para que apareciera la barra bulk: sin eso, el
 * botón Commit quedaba muerto sin explicar por qué (el usuario escribía el
 * mensaje y no pasaba nada).
 *
 * La solución es la acción de staging **por fila al hover** (como el `+` de VS
 * Code). Estos tests verifican que el cableado siga existiendo: sin entorno DOM,
 * se comprueba sobre el código, que es justo lo que se rompió.
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const src = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const ROW = 'src/renderer/src/features/explorer/components/ExplorerRow.tsx'
const PANEL = 'src/renderer/src/features/explorer/ExplorerPanel.tsx'
const VIEW = 'src/renderer/src/features/explorer/ExplorerView.tsx'
const GIT = 'src/renderer/src/features/layout/panels/GitPanel/GitPanel.tsx'

describe('acciones por fila en el árbol', () => {
  it('la fila dibuja las acciones declaradas, con su propio estilo', () => {
    const row = src(ROW)
    expect(row).toContain('export interface RowAction')
    // Declarativas: el consumidor no trae CSS ni DOM.
    expect(row).toMatch(/rowActions\?:\s*\(node: FileNode\) => RowAction\[\]/)
    // Se dibujan con la MISMA clase que el "…", que ya aparece en hover.
    expect(row).toMatch(/rowActions\(node\)\.map/)
    expect(row).toContain('className={styles.dots}')
  })

  it('la vista reenvía las acciones y el panel nativo recibe el estado de Git', () => {
    // Con el explorer nativo (C++/WASM) el panel ya no pasa `rowActions` a una
    // fila React: el core pinta las badges y recibe el estado por bridge.
    // Se comprueba el cableo que sí existe en el panel actual.
    expect(src(VIEW)).toContain('rowActions={rowActions}')
    const panel = src(PANEL)
    expect(panel).toContain('rowActions?: unknown')
    expect(panel).toMatch(/ex\.setGitBadges\(/)
    expect(panel).toMatch(/ex\.setGitVisible\(/)
  })

  it('el panel de Git ofrece stage/unstage por archivo', () => {
    const git = src(GIT)
    // La acción depende de si ESE path ya está en el índice (leído por ref para
    // que el callback sea ESTABLE y no rompa el `memo` de cada fila).
    expect(git).toMatch(/stagedSetRef\.current\.has\(node\.path\)/)
    expect(git).toContain('onStage([toRel(node.path)])')
    expect(git).toContain('onUnstage([toRel(node.path)])')
    // No se ofrece en carpetas.
    expect(git).toMatch(/node\.isDirectory/)
  })

  it('la API es pública y tipada', () => {
    // El consumidor puede tipar sus props sin reimportar internals.
    const view = src(VIEW)
    expect(view).toContain('export interface ExplorerViewProps')
    const barrel = src('src/renderer/src/features/explorer/index.ts')
    expect(barrel).toMatch(/type ExplorerViewProps/)
    expect(barrel).toMatch(/type RowAction/)
    expect(barrel).toMatch(/export type \{ FileNode \}/)
  })

  it('el recuadro de selección ejecuta la acción del consumidor', () => {
    const panel = src(PANEL)
    // Default: seleccionar (y con Ctrl/Cmd, SUMAR). Con `onLasso`, decide el consumidor.
    expect(panel).toMatch(/if \(onLasso\) \{/)
    expect(panel).toMatch(/onLasso\(paths, \{/)
    // El core nativo hace el lasso; el host sólo publica el resultado y el
    // contexto (`select` + `additive`) para que el consumidor pueda COMPONER.
    expect(panel).toMatch(/ex\.lassoPaths\(\)/)
    expect(panel).toMatch(/additive/)
    expect(panel).toMatch(/onLasso\?:\s*\(paths: string\[\], ctx: LassoContext\) => void/)
    expect(src(VIEW)).toMatch(/onLasso\?:\s*\(paths: string\[\], ctx: LassoContext\)/)
  })

  it('Ctrl/Cmd vuelve aditivo el recuadro (no limpia y suma)', () => {
    const box = src('src/renderer/src/features/explorer/hooks/useSelectionBox.ts')
    expect(box).toContain('export interface LassoContext')
    // Se lee el modificador al empezar y NO se limpia la selección previa.
    expect(box).toMatch(/const additive = event\.ctrlKey \|\| event\.metaKey/)
    expect(box).toMatch(/if \(!additive\) onClearRef\.current\(\)/)
    // Y se propaga al commit para que el consumidor una.
    expect(box).toMatch(/onCommitRef\.current\(pendingPaths\.current, additiveRef\.current\)/)
  })

  it('Git usa el recuadro para preparar en lote (selecciona + stagea)', () => {
    const git = src(GIT)
    expect(git).toContain('onLasso={')
    // Compone: primero selecciona (con refs, para no cambiar de identidad),
    // después stagea lo que no estaba.
    expect(git).toMatch(/selectedRef\.current/)
    expect(git).toMatch(/select\(additive \?/)
    expect(git).toMatch(/filter\(\(p\) => !stagedSet\.has\(p\)\)/)
    expect(git).toMatch(/onStage\(pending\)/)
  })

  it('Commit sigue exigiendo índice y Todo sigue siendo stage-all', () => {
    const git = src(GIT)
    const box = src('src/renderer/src/features/layout/panels/GitPanel/CommitBox.tsx')
    // Si alguien "arregla" Commit relajando esto, se pierde la semántica de git.
    expect(git).toMatch(/hasStaged=\{state\.staged\.length > 0\}/)
    expect(box).toMatch(/disabled=\{committing \|\| !hasText \|\| !hasStaged\}/)
    expect(box).toMatch(/disabled=\{committing \|\| !hasText \|\| !hasChanges\}/)
    // Y el panel ya NO se re-renderiza por tecla: el mensaje vive en CommitBox.
    expect(git).not.toContain('const [commitMessage')
    expect(box).toContain('useRef<HTMLTextAreaElement>')
  })
})