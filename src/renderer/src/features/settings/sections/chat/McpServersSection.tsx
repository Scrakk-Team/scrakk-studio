// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ajustes → Chat → Servidores MCP.
 *
 * Config en `.scrakk/mcp.json` (capas user/project). Alta/baja/edición de
 * servidores locales (stdio) y remotos (HTTP + OAuth), con estado de conexión
 * en vivo publicado por el main.
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { ToggleSwitch } from '@ui'
import {
  loadMcpConfig,
  mcpService,
  writeMcpConfig
} from '@services/mcp'
import type { McpServerConfig as Config, McpServerStatus, McpDiscoveredServer, McpDiscoveryResult } from '@shared/mcp'
import styles from './McpServersSection.module.css'

import { t } from '@core/i18n'

function emptyForm(): Config {
  return { id: '', type: 'local', command: ['npx', '-y', ''], environment: {} }
}

export function McpServersSection(): JSX.Element {
  const [configs, setConfigs] = useState<Record<string, Config>>({})
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])
  const [form, setForm] = useState<Config | null>(null)
  const [saving, setSaving] = useState(false)
  const [discovery, setDiscovery] = useState<McpDiscoveryResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const refresh = useCallback(async (): Promise<void> => {
    const config = await loadMcpConfig()
    setConfigs(config.mcpServers ?? {})
    setStatuses(await mcpService.listServers())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const persist = useCallback(
    async (next: Record<string, Config>): Promise<void> => {
      setSaving(true)
      await writeMcpConfig(next, 'project')
      await mcpService.reload()
      setConfigs(next)
      setSaving(false)
    },
    []
  )

  const statusFor = (id: string): McpServerStatus | undefined =>
    statuses.find((s) => s.id === id)

  const runDiscovery = async (): Promise<void> => {
    setScanning(true)
    const result = await mcpService.discover()
    setDiscovery(result)
    setSelected(new Set(result.servers.map((s) => s.id)))
    setScanning(false)
  }

  const importSelected = (): void => {
    if (!discovery) return
    const next = { ...configs }
    for (const candidate of discovery.servers) {
      if (!selected.has(candidate.id)) continue
      const id = configs[candidate.id] ? `${candidate.id}-${candidate.source}` : candidate.id
      next[id] = { ...candidate.config, id }
    }
    void persist(next)
    setDiscovery(null)
  }

  const change = (id: string, patch: Partial<Config>): void => {
    void persist({ ...configs, [id]: { ...configs[id], ...patch } })
  }

  const saveForm = (): void => {
    if (!form || !form.id.trim()) return
    const clean: Config = {
      ...form,
      id: form.id.trim(),
      command:
        form.type === 'local'
          ? (form.command ?? []).filter(Boolean)
          : undefined,
      url: form.type === 'remote' ? form.url?.trim() : undefined
    }
    void persist({ ...configs, [clean.id]: clean })
    setForm(null)
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3>{t('settings.mcp.titulo')}</h3>
        <p>{t('settings.mcp.descripcion')}</p>
      </div>

      <div className={styles.rowBtns}>
        <button type="button" className={styles.btn} disabled={scanning} onClick={() => void runDiscovery()}>
          <ProductIcon id="search" size={14} />
          {scanning ? t('settings.mcp.buscando') : t('settings.mcp.detectar')}
        </button>
        <span className={styles.meta}>{t('settings.mcp.detectar.hint')}</span>
      </div>

      {discovery ? (
        <div className={styles.form}>
          <span className={styles.formTitle}>
            {t('settings.mcp.encontrados', { count: String(discovery.servers.length) })}
          </span>
          {discovery.scanned.length > 0 ? (
            <span className={styles.meta}>
              {t('settings.mcp.escaneado')}: {discovery.scanned.map((p) => p.split('/').pop()).join(', ')}
            </span>
          ) : null}
          {discovery.servers.length === 0 ? (
            <span className={styles.empty}>{t('settings.mcp.no.encontrados')}</span>
          ) : (
            discovery.servers.map((candidate: McpDiscoveredServer) => (
              <label key={`${candidate.source}-${candidate.id}`} className={styles.candidate}>
                <input
                  type="checkbox"
                  checked={selected.has(candidate.id)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(candidate.id)
                    else next.delete(candidate.id)
                    setSelected(next)
                  }}
                />
                <span className={styles.candidateBody}>
                  <span className={styles.candidateName}>{candidate.config.label || candidate.id}</span>
                  <span className={styles.candidateMeta}>
                    <span className={styles.serverType}>{candidate.source === 'running' ? t('settings.mcp.activo') : candidate.source}</span>
                    <code>{candidate.config.url ?? (candidate.config.command ?? []).join(' ')}</code>
                  </span>
                </span>
              </label>
            ))
          )}
          <div className={styles.rowBtns}>
            <button type="button" className={styles.btn} disabled={selected.size === 0 || saving} onClick={importSelected}>
              <ProductIcon id="plus" size={14} /> {t('settings.mcp.importar')}
            </button>
            <button type="button" className={styles.btn} onClick={() => setDiscovery(null)}>
              {t('settings.mcp.cancelar')}
            </button>
          </div>
        </div>
      ) : null}

      {Object.keys(configs).length === 0 && !form ? (
        <div className={styles.empty}>{t('settings.mcp.sin.servidores')}</div>
      ) : null}

      {Object.entries(configs).map(([id, config]) => {
        const status = statusFor(id)
        const connected = status?.status === 'connected'
        const dotClass =
          connected ? styles.dotConnected
          : status?.status === 'error' ? styles.dotError
          : status?.status === 'connecting' ? styles.dotConnecting
          : ''
        return (
          <div key={id} className={styles.server}>
            <div className={styles.serverTop}>
              <span className={styles.serverName}>{config.label || id}</span>
              <span className={styles.serverType}>{config.type === 'local' ? 'stdio' : 'HTTP'}</span>
              <span className={styles.status}>
                <span className={`${styles.dot} ${dotClass}`} />
                {status?.status ?? 'disconnected'}
              </span>
            </div>
            <div className={styles.meta}>
              {config.type === 'local' ? (
                <code>{(config.command ?? []).join(' ')}</code>
              ) : (
                <code>{config.url}</code>
              )}
              {status ? (
                <span>
                  {status.toolCount} {t('settings.mcp.herramientas')}
                  {status.resourceCount > 0 ? ` · ${status.resourceCount} ${t('settings.mcp.recursos')}` : ''}
                </span>
              ) : null}
            </div>
            {status?.error ? <p className={styles.error}>{status.error}</p> : null}
            {status?.instructions ? (
              <p className={styles.instructions} title={status.instructions}>
                {status.instructions.slice(0, 180)}
              </p>
            ) : null}
            <div className={styles.rowBtns}>
              <ToggleSwitch
                checked={!config.disabled}
                label={t('settings.mcp.habilitado')}
                onChange={(next) => change(id, { disabled: !next })}
              />
              {config.type === 'remote' && status?.status === 'error' ? (
                <button type="button" className={styles.btn} onClick={() => void mcpService.authStart(id).then(() => refresh())}>
                  <ProductIcon id="key" size={13} /> {t('settings.mcp.autorizar')}
                </button>
              ) : null}
              {!connected ? (
                <button type="button" className={styles.btn} disabled={saving} onClick={() => void mcpService.connect(id).then(refresh)}>
                  <ProductIcon id="refresh" size={13} /> {t('settings.mcp.conectar')}
                </button>
              ) : (
                <button type="button" className={styles.btn} onClick={() => void mcpService.disconnect(id).then(refresh)}>
                  {t('settings.mcp.desconectar')}
                </button>
              )}
              <button type="button" className={styles.btn} onClick={() => setForm({ ...config })}>
                <ProductIcon id="pencil" size={13} /> {t('settings.mcp.editar')}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => {
                  const next = { ...configs }
                  delete next[id]
                  void persist(next)
                }}
              >
                <ProductIcon id="trash" size={13} /> {t('settings.mcp.eliminar')}
              </button>
            </div>
          </div>
        )
      })}

      {form ? (
        <div className={styles.form}>
          <span className={styles.formTitle}>
            {configs[form.id] ? t('settings.mcp.editar') : t('settings.mcp.nuevo')}
          </span>
          <div className={styles.seg}>
            <button type="button" className={`${styles.segBtn} ${form.type === 'local' ? styles.segBtnActive : ''}`} onClick={() => setForm({ ...form, type: 'local', command: form.command ?? ['npx', '-y', ''] })}>
              Local (stdio)
            </button>
            <button type="button" className={`${styles.segBtn} ${form.type === 'remote' ? styles.segBtnActive : ''}`} onClick={() => setForm({ ...form, type: 'remote', url: form.url ?? '' })}>
              Remoto (HTTP)
            </button>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('settings.mcp.id')}</span>
            <input className={styles.input} value={form.id} disabled={Boolean(configs[form.id])} placeholder="context7" onChange={(e) => setForm({ ...form, id: e.target.value })} />
          </label>
          {form.type === 'local' ? (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('settings.mcp.comando')}</span>
                <input
                  className={styles.input}
                  value={(form.command ?? []).join(' ')}
                  placeholder="npx -y @modelcontextprotocol/server-everything"
                  onChange={(e) => setForm({ ...form, command: e.target.value.split(/\s+/) })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('settings.mcp.entorno')}</span>
                <input
                  className={styles.input}
                  value={Object.entries(form.environment ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')}
                  placeholder="LOG_LEVEL=info, TOKEN={env:MCP_TOKEN}"
                  onChange={(e) => {
                    const env: Record<string, string> = {}
                    for (const pair of e.target.value.split(',')) {
                      const [key, ...rest] = pair.trim().split('=')
                      if (key) env[key] = rest.join('=').trim()
                    }
                    setForm({ ...form, environment: env })
                  }}
                />
              </label>
            </>
          ) : (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('settings.mcp.url')}</span>
              <input className={styles.input} value={form.url ?? ''} placeholder="https://mcp.example.com/mcp" onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </label>
          )}
          <div className={styles.rowBtns}>
            <button type="button" className={styles.btn} disabled={!form.id.trim() || saving} onClick={saveForm}>
              {t('settings.mcp.guardar')}
            </button>
            <button type="button" className={styles.btn} onClick={() => setForm(null)}>
              {t('settings.mcp.cancelar')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.btn} onClick={() => setForm(emptyForm())}>
          <ProductIcon id="plus" size={14} /> {t('settings.mcp.nuevo')}
        </button>
      )}
    </div>
  )
}
