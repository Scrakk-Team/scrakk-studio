// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Resaltado — quién pinta los tokens del editor.
 *
 * Son DOS decisiones independientes, y por eso hay dos grupos:
 *
 * 1. **Fuente** (`editor.highlightSource`): qué gana en el overlay.
 *      - treesitter: gramáticas locales (default, sin server).
 *      - lsp: SOLO semantic tokens del language server.
 *      - mixed: base local + overlay de semantic tokens donde cubre.
 * 2. **Motor de gramática** (`editor.grammarEngine`): qué motor produce la capa
 *    de gramática cuando un lenguaje trae las DOS cosas (un `.tmLanguage` que
 *    vino de VS Code y un parser tree-sitter con sus `.scm`). Sin esta opción
 *    el desempate era invisible: TextMate ganaba siempre y el parser del
 *    paquete quedaba cargado, con su proceso aparte, para nada.
 *
 * Las dos preferencias viven en el storage system y las consumen los puentes
 * de Innerta (`languageHighlightBridge` / `treeSitterHighlightBridge`).
 */

import { useEffect, useState, type JSX } from 'react'
import {
  getPersistedGrammarEngine,
  getPersistedHighlightSource,
  persistGrammarEngine,
  persistHighlightSource,
  type EditorGrammarEngine,
  type EditorHighlightSource
} from '@services/storage'
import { openTokenInspector } from '@features/editor/inspect'
import { getHighlightDiagnostics } from '@features/editor/engines/innerta/hostTokens'
import { HIGHLIGHT_SOURCE_EVENT } from '@features/editor/engines/innerta/InnertaEngine'
import styles from './HighlightSection.module.css'

import { t } from '@core/i18n'
const SOURCE_OPTIONS: Array<{ id: EditorHighlightSource; label: string; desc: string }> = [
  {
    id: 'treesitter',
    get label() { return t('settings.tree.sitter') },
    get desc() { return t('settings.gramaticas.locales.rapido.sin.servidor') }
  },
  {
    id: 'lsp',
    get label() { return t('settings.lsp.semantic.tokens') },
    get desc() { return t('settings.solo.tokens.del.language.server') }
  },
  {
    id: 'mixed',
    get label() { return t('settings.mixto') },
    get desc() { return t('settings.base.tree.sitter.overlay.lsp') }
  }
]

const ENGINE_OPTIONS: Array<{ id: EditorGrammarEngine; label: string; desc: string }> = [
  {
    id: 'auto',
    get label() { return t('settings.automatico') },
    desc: 'TextMate si el paquete lo trae; si no, el parser tree-sitter.'
  },
  {
    id: 'treeSitter',
    get label() { return t('settings.tree.sitter.del.paquete') },
    get desc() { return t('settings.siempre.el.arbol.de.sintaxis') }
  },
  {
    id: 'textMate',
    label: 'TextMate',
    get desc() { return t('settings.solo.gramaticas.tmlanguage.no.levanta') }
  }
]

export function HighlightSection(): JSX.Element {
  const [source, setSource] = useState<EditorHighlightSource>(() =>
    getPersistedHighlightSource()
  )
  const [engine, setEngine] = useState<EditorGrammarEngine>(() => getPersistedGrammarEngine())
  const [diag, setDiag] = useState(() => getHighlightDiagnostics())

  // Estado REAL (no el guardado): qué está publicando el host AHORA MISMO.
  // Refresca solo para que la opción sea verificable, no solo "se guardó".
  useEffect(() => {
    const id = setInterval(() => setDiag(getHighlightDiagnostics()), 1000)
    return () => clearInterval(id)
  }, [])

  const handleSelectSource = (next: EditorHighlightSource): void => {
    setSource(next)
    persistHighlightSource(next)
    // El puente de Innerta escucha este evento (innertaTheme ya lo hace).
    window.dispatchEvent(new CustomEvent(HIGHLIGHT_SOURCE_EVENT, { detail: { source: next } }))
  }

  const handleSelectEngine = (next: EditorGrammarEngine): void => {
    setEngine(next)
    persistGrammarEngine(next)
    // Los dos puentes de gramática escuchan `highlight-engine-changed`: tienen
    // que recalcular el archivo abierto ya (si no, el cambio recién se vería al
    // reabrir el archivo).
    window.dispatchEvent(new CustomEvent('highlight-engine-changed', { detail: { engine: next } }))
  }

  return (
    <div className={styles.section}>
      <div className={styles.headerText}>
        <h3>{t('settings.nav.highlight')}</h3>
        <p>{t('settings.la.opcion.aplica.al.editor')}</p>
      </div>
      <div className={styles.grid}>
        {SOURCE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[styles.card, source === option.id ? styles.cardActive : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleSelectSource(option.id)}
          >
            <span className={styles.cardLabel}>{option.label}</span>
            <span className={styles.cardDesc}>{option.desc}</span>
          </button>
        ))}
      </div>

      {/* Estado en vivo: demuestra que el ajuste aplica de verdad. */}
      <p className={styles.hint}>
        {`resaltado: ${
          diag.mode === 0 ? 'motor' : diag.mode === 1 ? t('settings.solo.host') : 'mixto'
        } · LSP ${diag.sources.semanticTokens} · tree-sitter ${diag.sources.treeSitterDynamic} · TextMate ${diag.sources.textMate}`}
      </p>

      <span className={styles.groupLabel}>{t('settings.motor.de.gramatica')}</span>
      <p className={styles.hint}>
        {t('settings.un.paquete.puede.traer.gramatica')}
      </p>
      <div className={styles.grid}>
        {ENGINE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[styles.card, engine === option.id ? styles.cardActive : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleSelectEngine(option.id)}
          >
            <span className={styles.cardLabel}>{option.label}</span>
            <span className={styles.cardDesc}>{option.desc}</span>
          </button>
        ))}
      </div>

      {/* Diagnóstico: qué fuente pintó cada token del archivo activo, con el
          scope y el color del tema. Es la forma de saber si el culpable es la
          gramática, el server o el tema. */}
      <button type="button" className={styles.diagnose} onClick={openTokenInspector}>
        {t('settings.inspeccionar.tokens.del.archivo.activo')}
      </button>
    </div>
  )
}
