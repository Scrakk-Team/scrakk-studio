// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { ToggleSwitch } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import type { ContextMenuItem } from '@ui'
import {
  getActivityBarMode,
  getDisabledActivitySide,
  setActivityBarMode,
  setDisabledActivitySide,
  subscribeToActivityBarSettings,
  type ActivityBarMode,
  type DisabledActivitySide
} from '@services/activityBarSettings'
import {
  isCompactChromeEnabled,
  setCompactChromeEnabled,
  isExtraBordersEnabled,
  setExtraBordersEnabled,
  subscribeToCompactChrome
} from '@services/compactChrome'
import {
  isSkipFilesOnExpandAll,
  setSkipFilesOnExpandAll,
  subscribeExplorerSettings
} from '@services/explorerSettings'
import {
  isExternalOpenHidePanels,
  setExternalOpenHidePanels,
  subscribeExternalOpenSettings
} from '@services/externalOpenSettings'
import {
  isProjectThemeEnabled,
  setProjectThemeEnabled,
  subscribeToProjectTheme
} from '@services/projectTheme'
import {
  TabStrip,
  isTabWidthFixed,
  getTabWidth,
  setTabWidthFixed,
  setTabWidth,
  isTabLabelCentered,
  setTabLabelCentered,
  subscribeToTabWidth,
  clampTabWidth,
  mountPreviewStrip,
  unmountPreviewStrip,
  PREVIEW_STRIP_ID,
  TAB_WIDTH_MIN,
  TAB_WIDTH_MAX
} from '@features/tabs'
import { t } from '@core/i18n'
import styles from './ExperimentalSection.module.css'

export function ExperimentalSection(): JSX.Element {
  const [skipFiles, setSkipFiles] = useState<boolean>(() => isSkipFilesOnExpandAll())
  const [hidePanels, setHidePanels] = useState<boolean>(() => isExternalOpenHidePanels())
  const [projectTheme, setProjectTheme] = useState<boolean>(() => isProjectThemeEnabled())
  const [compactChrome, setCompactChrome] = useState<boolean>(() => isCompactChromeEnabled())
  const [extraBorders, setExtraBorders] = useState<boolean>(() => isExtraBordersEnabled())
  const [activityMode, setActivityMode] = useState<ActivityBarMode>(getActivityBarMode)
  const [disabledSide, setDisabledSide] = useState<DisabledActivitySide>(getDisabledActivitySide)
  const [fixedTabs, setFixedTabs] = useState<boolean>(() => isTabWidthFixed())
  const [tabWidth, setTabWidthState] = useState<number>(() => getTabWidth())
  const [centerLabel, setCenterLabel] = useState<boolean>(() => isTabLabelCentered())
  // El slider es de resorte: al soltar vuelve al centro (no guarda su posición).
  const sliderCenter = Math.round((TAB_WIDTH_MIN + TAB_WIDTH_MAX) / 2)
  const [sliderValue, setSliderValue] = useState<number>(sliderCenter)

  useEffect(
    () =>
      subscribeExplorerSettings(() => {
        setSkipFiles(isSkipFilesOnExpandAll())
      }),
    []
  )

  useEffect(() => subscribeExternalOpenSettings(() => setHidePanels(isExternalOpenHidePanels())), [])

  useEffect(
    () => subscribeToProjectTheme(() => setProjectTheme(isProjectThemeEnabled())),
    []
  )

  useEffect(
    () =>
      subscribeToCompactChrome(() => {
        setCompactChrome(isCompactChromeEnabled())
        setExtraBorders(isExtraBordersEnabled())
      }),
    []
  )

  useEffect(
    () =>
      subscribeToActivityBarSettings(() => {
        setActivityMode(getActivityBarMode())
        setDisabledSide(getDisabledActivitySide())
      }),
    []
  )

  useEffect(
    () =>
      subscribeToTabWidth(() => {
        setFixedTabs(isTabWidthFixed())
        setTabWidthState(getTabWidth())
        setCenterLabel(isTabLabelCentered())
      }),
    []
  )

  // El ejemplo usa el TabStrip REAL con un strip efímero del tabsStore.
  useEffect(() => {
    mountPreviewStrip()
    return unmountPreviewStrip
  }, [])

  const modeLabel: Record<ActivityBarMode, string> = {
    default: t('settings.activitybar.normal'),
    centered: t('settings.activitybar.centered'),
    wheel: t('settings.activitybar.wheel')
  }
  const sideLabel: Record<DisabledActivitySide, string> = {
    none: t('settings.activitybar.none'),
    left: t('settings.activitybar.left'),
    right: t('settings.activitybar.right')
  }

  const openActivityModeMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const modes: ActivityBarMode[] = ['default', 'centered', 'wheel']
    showContextMenu(
      rect.left,
      rect.bottom,
      modes.map((value): ContextMenuItem => ({
        label: modeLabel[value],
        checked: activityMode === value,
        onClick: () => setActivityBarMode(value)
      }))
    )
  }

  const openDisabledSideMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const sides: DisabledActivitySide[] = ['none', 'left', 'right']
    showContextMenu(
      rect.left,
      rect.bottom,
      sides.map((value): ContextMenuItem => ({
        label: sideLabel[value],
        checked: disabledSide === value,
        onClick: () => setDisabledActivitySide(value)
      }))
    )
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h3>{t('settings.experimental')}</h3>
          <p>{t('settings.experimental.descripcion')}</p>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>
            {t('settings.expandir.todo.omitir.archivos')}
          </span>
          <span className={styles.rowHint}>
            {t('settings.expandir.todo.omitir.archivos.hint')}
          </span>
        </div>
        <ToggleSwitch
          checked={skipFiles}
          onChange={(next) => {
            setSkipFilesOnExpandAll(next)
            setSkipFiles(next)
          }}
          label={t('settings.expandir.todo.omitir.archivos')}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>
            {t('settings.abrir.desde.so.ocultar.paneles')}
          </span>
          <span className={styles.rowHint}>
            {t('settings.abrir.desde.so.ocultar.paneles.hint')}
          </span>
        </div>
        <ToggleSwitch
          checked={hidePanels}
          onChange={(next) => {
            setExternalOpenHidePanels(next)
            setHidePanels(next)
          }}
          label={t('settings.abrir.desde.so.ocultar.paneles')}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{t('settings.tema.por.proyecto')}</span>
          <span className={styles.rowHint}>{t('settings.tema.por.proyecto.hint')}</span>
        </div>
        <ToggleSwitch
          checked={projectTheme}
          onChange={(next) => {
            setProjectThemeEnabled(next)
            setProjectTheme(next)
          }}
          label={t('settings.tema.por.proyecto')}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{t('settings.chrome.compacto')}</span>
          <span className={styles.rowHint}>{t('settings.chrome.compacto.hint')}</span>
        </div>
        <ToggleSwitch
          checked={compactChrome}
          onChange={(next) => {
            setCompactChromeEnabled(next)
            setCompactChrome(next)
          }}
          label={t('settings.chrome.compacto')}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{t('settings.chrome.bordes.extra')}</span>
          <span className={styles.rowHint}>{t('settings.chrome.bordes.extra.hint')}</span>
        </div>
        <ToggleSwitch
          checked={extraBorders}
          disabled={!compactChrome}
          onChange={(next) => {
            setExtraBordersEnabled(next)
            setExtraBorders(next)
          }}
          label={t('settings.chrome.bordes.extra')}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{t('settings.activitybar.centrado')}</span>
          <span className={styles.rowHint}>{t('settings.activitybar.centrado.hint')}</span>
        </div>
        <div className={styles.rowControl}>
          <button type="button" className={styles.pickerBtn} onClick={openActivityModeMenu}>
            <span className={styles.pickerValue}>{modeLabel[activityMode]}</span>
            <ProductIcon id="chevron-down" size={12} className={styles.pickerCaret} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{t('settings.activitybar.desactivar')}</span>
          <span className={styles.rowHint}>{t('settings.activitybar.desactivar.hint')}</span>
        </div>
        <div className={styles.rowControl}>
          <button type="button" className={styles.pickerBtn} onClick={openDisabledSideMenu}>
            <span className={styles.pickerValue}>{sideLabel[disabledSide]}</span>
            <ProductIcon id="chevron-down" size={12} className={styles.pickerCaret} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>
            {t('settings.tabs.mismo.tamano')}
          </span>
          <span className={styles.rowHint}>
            {t('settings.tabs.mismo.tamano.hint')}
          </span>
        </div>
        <div className={styles.rowControl}>
          <div className={styles.sliderWrap}>
            <input
              className={styles.widthSlider}
              type="range"
              min={TAB_WIDTH_MIN}
              max={TAB_WIDTH_MAX}
              value={sliderValue}
              disabled={!fixedTabs}
              aria-label={t('settings.tabs.mismo.tamano.ancho')}
              onChange={(event) => {
                const next = clampTabWidth(Number(event.target.value))
                setSliderValue(next)
                setTabWidth(next)
                setTabWidthState(next)
              }}
              onPointerUp={() => setSliderValue(sliderCenter)}
              onKeyUp={() => setSliderValue(sliderCenter)}
              onBlur={() => setSliderValue(sliderCenter)}
            />
            <span className={styles.widthValue}>{tabWidth} px</span>
          </div>
          <ToggleSwitch
            checked={fixedTabs}
            onChange={(next) => {
              setTabWidthFixed(next)
              setFixedTabs(next)
            }}
            label={t('settings.tabs.mismo.tamano')}
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>
            {t('settings.tabs.centrar.texto')}
          </span>
          <span className={styles.rowHint}>
            {t('settings.tabs.centrar.texto.hint')}
          </span>
        </div>
        <ToggleSwitch
          checked={centerLabel}
          disabled={!fixedTabs}
          onChange={(next) => {
            setTabLabelCentered(next)
            setCenterLabel(next)
          }}
          label={t('settings.tabs.centrar.texto')}
        />
      </div>

      {/* Ejemplo REAL: el mismo TabStrip del workspace sobre un strip efímero
          creado con la API de tabs (tabsStore + fileTab/panelTab). */}
      <div className={styles.exampleBox}>
        <span className={styles.exampleLabel}>{t('settings.tabs.mismo.tamano.ejemplo')}</span>
        <div className={styles.exampleStrip}>
          <TabStrip stripId={PREVIEW_STRIP_ID} />
        </div>
      </div>
    </div>
  )
}
