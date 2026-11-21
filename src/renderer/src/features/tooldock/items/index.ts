// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Items builtin del ToolDock — se registran solos al importar este módulo
 * (el registry lo hace). Cada item declara sus hosts: nada hardcodeado en
 * los paneles que montan el dock.
 */

import { registerToolDockItem } from '../registry'
import OutlinePanel from './outline/OutlinePanel'
import TimelinePanel from './timeline/TimelinePanel'
import BookmarksPanel from './bookmarks/BookmarksPanel'
import FileInfoPanel from './fileinfo/FileInfoPanel'

import { t } from '@core/i18n'
export function registerBuiltinToolDockItems(): void {
  registerToolDockItem({
    id: 'outline',
    kind: 'panel',
    title: t('features.esquema'),
    icon: 'code',
    order: 10,
    hosts: ['explorer'],
    component: OutlinePanel
  })

  registerToolDockItem({
    id: 'timeline',
    kind: 'panel',
    title: t('features.linea.de.tiempo'),
    icon: 'history',
    order: 20,
    hosts: ['explorer'],
    component: TimelinePanel
  })

  registerToolDockItem({
    id: 'bookmarks',
    kind: 'panel',
    title: t('features.marcadores'),
    icon: 'bookmark',
    order: 30,
    hosts: ['explorer'],
    component: BookmarksPanel
  })

  registerToolDockItem({
    id: 'fileinfo',
    kind: 'panel',
    title: t('features.fileinfo.titulo'),
    icon: 'info',
    order: 40,
    hosts: ['explorer'],
    component: FileInfoPanel
  })
}

// Auto-registro al importar (idempotente: Map sobrescribe por id).
registerBuiltinToolDockItems()
