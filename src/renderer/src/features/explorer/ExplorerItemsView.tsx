// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Lista custom con la MISMA fila del Explorer.
 *
 * No lee el filesystem: el consumidor entrega los items ya resueltos (nombre,
 * ícono, datos) y esta vista los pinta con `ExplorerRow` — selección, hover,
 * tipografía, tooltip y altura idénticos al árbol real. La usan los dropdowns
 * de símbolos del breadcrumb; no hay una lista paralela con CSS propio.
 */

import {
  useMemo,
  type DragEvent as ReactDragEvent,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import { ExplorerRow } from './components/ExplorerRow'
import type { FileNode } from './hooks/useWorkspaceState'
import styles from './Explorer.module.css'

import { t } from '@core/i18n'

export interface ExplorerItem<T = unknown> {
  /** Id único dentro de la lista. */
  id: string
  name: string
  /** Ícono ya resuelto por el consumidor (default: FileTypeIcon por nombre). */
  icon?: ReactNode
  /** Tooltip de la fila (default: `name`). */
  title?: string
  /** Fila resaltada (el símbolo actual, por ejemplo). */
  selected?: boolean
  /** Dato opaco que el consumidor recupera en `onSelect`. */
  data: T
}

export interface ExplorerItemsViewProps<T> {
  items: ExplorerItem<T>[]
  onSelect: (item: ExplorerItem<T>) => void
  /** Etiqueta accesible del árbol. */
  ariaLabel?: string
}

const NOOP = (): void => {}
const NOOP_PATH = (_path: string): void => {}
const NOOP_NODE = (_node: FileNode): void => {}
const NOOP_EVENT_NODE = (_event: ReactMouseEvent, _node: FileNode): void => {}
const NOOP_DRAG = (_event: ReactDragEvent, _node: FileNode): void => {}
const NOOP_EDIT_VALUE = (_value: string): void => {}

function toNode<T>(item: ExplorerItem<T>): FileNode {
  return {
    name: item.name,
    path: item.id,
    isDirectory: false,
    children: null,
    isExpanded: false,
    level: 0
  }
}

export function ExplorerItemsView<T>({
  items,
  onSelect,
  ariaLabel
}: ExplorerItemsViewProps<T>): JSX.Element {
  const rows = useMemo(() => items.map((item) => ({ item, node: toNode(item) })), [items])

  return (
    <div className={styles.itemsView}>
      <div
        className={styles.tree}
        role="tree"
        aria-label={ariaLabel ?? t('explorer.explorador.de.archivos')}
      >
        {rows.map(({ item, node }) => (
          <ExplorerRow
            key={item.id}
            node={node}
            level={0}
            isSelected={item.selected ?? false}
            isEditing={false}
            isDragging={false}
            isDropTarget={false}
            editValue=""
            onEditValueChange={NOOP_EDIT_VALUE}
            onSelect={() => onSelect(item)}
            onToggle={NOOP_PATH}
            onContextMenu={NOOP_EVENT_NODE}
            onOpenMenu={NOOP_EVENT_NODE}
            onDoubleClick={NOOP_NODE}
            onCommitEdit={NOOP_NODE}
            onCancelEdit={NOOP}
            onDragStart={NOOP_DRAG}
            onDragOver={NOOP_DRAG}
            onDrop={NOOP_DRAG}
            onDragEnd={NOOP}
            decoration={null}
            hideDots
            hideArrow
            icon={item.icon}
            title={item.title ?? item.name}
            interactive={false}
          />
        ))}
      </div>
    </div>
  )
}
