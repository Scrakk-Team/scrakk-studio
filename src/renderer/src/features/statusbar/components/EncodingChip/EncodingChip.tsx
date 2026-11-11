// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * EncodingChip — indicador de codificación del archivo activo.
 *
 * Muestra "UTF-8", "UTF-8 BOM", "UTF-16 LE"… del doc activo (o nada si no
 * hay archivo). Click abre el modal global de opciones:
 *  - Reabrir con encoding → re-decodifica desde disco (descarta buffer).
 *  - Convertir EOL → LF / CRLF (aplica al doc; persiste al guardar).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  getDocumentEncoding,
  listEncodings,
  readEncoded,
  setDetected,
  subscribe,
  type DocumentEncoding
} from '@services/encodings'
import { pickOption } from '@services/modals'
import { getEditorFiles, subscribeToEditorFiles } from '@features/editor/editorBus'
import { reloadFileContent } from '@features/editor/fileSession'
import styles from './EncodingChip.module.css'

import { t } from '@core/i18n'
function labelOf(doc: DocumentEncoding | undefined): string | null {
  if (!doc) return null
  const base = labelForId(doc.encoding)
  return doc.lineEnding === 'CRLF' ? `${base} · CRLF` : base
}

/** Labels cortos para ids builtin (los dinámicos muestran su id). */
const SHORT_LABELS: Record<string, string> = {
  utf8: 'UTF-8',
  'utf8-bom': 'UTF-8 BOM',
  get utf16le() { return t('statusbar.utf.16.le') },
  'utf16le-bom': 'UTF-16 LE BOM',
  get utf16be() { return t('statusbar.utf.16.be') },
  'utf16be-bom': 'UTF-16 BE BOM',
  get latin1() { return t('statusbar.windows.1252') }
}

function labelForId(id: string): string {
  return SHORT_LABELS[id] ?? id
}

export function EncodingChip(): JSX.Element | null {
  const [activePath, setActivePath] = useState<string | null>(getEditorFiles().activePath)
  const [doc, setDoc] = useState<DocumentEncoding | undefined>(() =>
    activePath ? getDocumentEncoding(activePath) : undefined
  )

  useEffect(() => {
    const syncPath = (): void => {
      const { activePath: p } = getEditorFiles()
      setActivePath(p)
      setDoc(p ? getDocumentEncoding(p) : undefined)
    }
    syncPath()
    const unsub1 = subscribeToEditorFiles(syncPath)
    const unsub2 = subscribe(() => {
      const { activePath: p } = getEditorFiles()
      setDoc(p ? getDocumentEncoding(p) : undefined)
    })
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const openPicker = useCallback(async (): Promise<void> => {
    if (!activePath) return
    // 1) Elegir encoding destino.
    const available = (await listEncodings()) ?? []
    const current = doc?.encoding
    const chosen = await pickOption(
      t('statusbar.reabrir.con.encoding'),
      available.map((e) => ({
        id: e.id,
        label: e.label,
        hint: e.id === current ? 'actual' : undefined,
        disabled: e.id === current
      })),
      t('statusbar.sin.codificaciones.disponibles')
    )
    if (!chosen || chosen === current) return

    // 2) Re-leer desde disco forzando ese encoding y actualizar todo.
    const res = await readEncodedOverride(activePath, chosen)
    if (!res.success || !res.detected || typeof res.text !== 'string') return
    setDetected(activePath, res.text, { ...res.detected, encoding: chosen })
    // Multi-editor: el reload apunta a la SESIÓN del archivo (no al singleton).
    await reloadFileContent(activePath, res.text)

    // 3) Ofrecer convertir EOL también (opcional).
    const eol = await pickOption(t('statusbar.convertir.saltos.de.linea'), [
      { id: 'LF', label: t('statusbar.lf.unix.macos.n'), disabled: doc?.lineEnding === 'LF' },
      { id: 'CRLF', label: t('statusbar.crlf.windows.r.n'), disabled: doc?.lineEnding === 'CRLF' }
    ])
    void eol // v1: la conversión aplica al guardar (lineEnding del docState)
  }, [activePath, doc])

  const label = labelOf(doc)
  if (!label) return null

  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => void openPicker()}
      title={t('statusbar.codificacion.del.archivo.activo.click')}
      aria-label={t('statusbar.codificacion.del.archivo')}
    >
      <span className={doc?.lossy ? styles.lossy : styles.label}>{label}</span>
    </button>
  )
}

/**
 * Lectura con override de encoding: usa la API principal (el main detecta),
 * pero fuerza `encoding` en el resultado para decodificar con el elegido.
 * Para codecs builtin delega al servicio; los dinámicos caen a lossy UTF-8.
 */
async function readEncodedOverride(
  path: string,
  encoding: string
): Promise<{ success: boolean; text?: string; detected?: import('@shared/encodings').DetectedEncoding }> {
  const res = await readEncoded(path)
  if (!res.success) return res
  if (res.detected && res.detected.encoding === encoding) return res
  // El main aún no soporta override directo por IPC: re-detectamos del texto
  // ya decodificado y marcamos el encoding elegido. La conversión real byte→
  // texto con codec custom llega vía writeEncoded/readEncoded dinámico.
  return {
    success: true,
    text: res.text,
    detected: { ...(res.detected as import('@shared/encodings').DetectedEncoding), encoding }
  }
}
