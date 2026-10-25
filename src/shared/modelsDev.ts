// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Módulo compartido (main + preload + renderer) — catálogo de modelos.
 *
 * La lista de proveedores ya NO es una carpeta hardcodeada por provider: sale
 * de [models.dev](https://models.dev) (`api.json`, MIT). El proceso main hace
 * el fetch (sin CORS), parsea la estructura completa, proyecta lo que la UI
 * necesita y lo cachea en disco; el renderer solo consume la lista lista.
 */

export const MODELS_DEV_IPC = {
  /** Catálogo actual (memoria → disco). Puede ser null si nunca se cargó. */
  catalog: 'modelsdev:catalog',
  /** Fuerza un fetch remoto y devuelve el catálogo nuevo. */
  refresh: 'modelsdev:refresh'
} as const

/** Opción de razonamiento declarada por el catálogo. */
export interface CatalogReasoningOption {
  type: 'toggle' | 'effort' | 'budget_tokens'
  /** Valores válidos cuando `type = 'effort'` (ej. low/high/max). */
  values?: string[]
  /** Mínimo de tokens cuando `type = 'budget_tokens'`. */
  min?: number
}

/** Variantes de razonamiento de un modelo (proyectadas del catálogo). */
export interface CatalogModelReasoning {
  /** El modelo acepta encender/apagar el razonamiento. */
  toggle?: boolean
  /** Valores de effort declarados (ej. low/high/max). */
  effort?: string[]
}

/** Precios del catálogo, en USD por 1M de tokens. */
export interface CatalogModelCost {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** Metadatos de un modelo que la UI necesita (contexto y precio). */
export interface CatalogModelMeta {
  /** Ventana de contexto en tokens. */
  context?: number
  /** Máximo de tokens de salida. */
  output?: number
  cost?: CatalogModelCost
}

/** Proveedor ya proyectado a lo que la app consume. */
export interface CatalogProviderConfig {
  id: string
  name: string
  description: string
  /** Base OpenAI-compatible — SIN `/chat/completions`. */
  baseUrl: string
  /** URL donde el usuario consigue su API key. */
  apiKeyUrl: string
  /** Modelo sugerido (el más nuevo que sirve para chat). */
  defaultModel: string
  /** Ids de modelo del catálogo, ordenados. */
  models: string[]
  /**
   * Variantes de razonamiento por modelo (solo los que las declaran):
   * `{ 'deepseek-flash': { toggle: true, effort: ['low','high','max'] } }`.
   */
  reasoning?: Record<string, CatalogModelReasoning>
  /**
   * Contexto y precio por modelo (`limit.context`, `cost.*` de models.dev).
   * Solo se incluyen los modelos que declaran alguno de los dos.
   */
  modelsMeta?: Record<string, CatalogModelMeta>
  /** Logo SVG (models.dev). */
  logo: string
  /** Headers extra del proveedor (ej. HTTP-Referer de OpenRouter). */
  headers?: Record<string, string>
}

export interface ModelsDevCatalog {
  /** Epoch ms del último fetch remoto. */
  fetchedAt: number
  providers: CatalogProviderConfig[]
}

export interface ModelsDevApi {
  /** Devuelve el catálogo cacheado (memoria o disco). */
  catalog: () => Promise<ModelsDevCatalog | null>
  /** Fuerza un fetch remoto; si falla, devuelve el cacheado. */
  refresh: () => Promise<ModelsDevCatalog | null>
}
