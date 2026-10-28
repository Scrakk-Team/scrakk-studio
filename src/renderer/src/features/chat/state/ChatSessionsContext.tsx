// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { ChatMessage } from '@services/chat'
import {
  getPersistedChatSessions,
  persistChatSessions,
  getPersistedChatActiveSession,
  persistChatActiveSession
} from '@services/storage'
import { scrakkProjectRoot } from '@services/scrakk'
import {
  cachedProjectId,
  ensureProjectId,
  filterSessionsByProject,
  migrateLegacySessions
} from '@services/workspaces'

import { t } from '@core/i18n'
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  /** Id del proyecto dueño (`<root>/.scrakk/history/id.json`). */
  projectId?: string
}

/** Compara raíces ignorando espacios y slashes finales. */
function sameRoot(a: string | null, b: string | null): boolean {
  const clean = (value: string | null): string => (value ?? '').trim().replace(/[/\\]+$/, '')
  return clean(a) === clean(b)
}

interface ChatsContextValue {
  sessions: ChatSession[]
  /** Id del proyecto activo (`NO_PROJECT_ID` si no hay carpeta abierta). */
  projectId: string | null
  activeSessionId: string | null
  activeSession: ChatSession | null
  /** Crea una sesión nueva, la deja activa y devuelve su id. */
  createSession: () => string
  selectSession: (id: string) => void
  appendMessage: (sessionId: string, message: ChatMessage) => void
  /** Actualiza un mensaje existente (usado por el stream para acumular). */
  updateMessage: (
    sessionId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => void
  /** Elimina los mensajes desde un índice (exclusivo) hasta el final. */
  removeMessagesAfter: (sessionId: string, keepCount: number) => void
  /** Elimina la sesión entera; si era la activa, activa la más reciente. */
  deleteSession: (sessionId: string) => void
}

const ChatsContext = createContext<ChatsContextValue | null>(null)

/**
 * Estado real de las conversaciones (no hardcodeado): las sesiones nacen
 * de las acciones del usuario y el historial del panel derecho las refleja.
 *
 * Persistencia: se hidrata desde localStorage al montar y se escribe con
 * debounce en cada mutación (el stream actualiza a cada chunk, no escribimos
 * a cada delta). Un flush en `beforeunload` garantiza que al cerrar la
 * ventana se guarde el estado más reciente.
 */
export function ChatsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => getPersistedChatSessions())
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    getPersistedChatActiveSession()
  )
  /**
   * Id del proyecto activo (o `NO_PROJECT_ID`). `null` = resolviéndose tras
   * un cambio de workspace: no se muestra el historial del proyecto anterior.
   */
  const [scope, setScope] = useState<string | null>(() => cachedProjectId(scrakkProjectRoot()))

  // Refs espejo para el flush de beforeunload (lee el valor actual sin
  // re-suscribir el listener en cada render).
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  const scopeRef = useRef<string | null>(scope)
  const rootRef = useRef<string | null>(scrakkProjectRoot())
  sessionsRef.current = sessions
  activeSessionIdRef.current = activeSessionId
  scopeRef.current = scope

  // Historial por proyecto: cada sesión queda atada al id de su proyecto.
  // Al cambiar de workspace se oculta el chat anterior al instante y se
  // resuelve la identidad del nuevo (`.scrakk/history/id.json`). El chat
  // nuevo arranca vacío: no se arrastra la conversación de la otra carpeta.
  useEffect(() => {
    let disposed = false
    let request = 0

    const resolve = (root: string | null): void => {
      const ticket = ++request
      void ensureProjectId(root).then((next) => {
        if (disposed || ticket !== request) return

        // Migración única del historial previo (sesiones sin projectId):
        // pertenecen al proyecto que estaba abierto al actualizar.
        setSessions((prev) => {
          const migrated = migrateLegacySessions(prev, next)
          return migrated.changed ? migrated.sessions : prev
        })

        const changed = scopeRef.current !== next
        if (changed) {
          scopeRef.current = next
          setScope(next)
        }

        // La sesión activa solo se conserva si es del proyecto resuelto (o si
        // todavía no tiene id, porque se acaba de crear durante el cambio).
        // Nunca mostrar una conversación de otra carpeta.
        const activeId = activeSessionIdRef.current
        const active = activeId
          ? sessionsRef.current.find((candidate) => candidate.id === activeId)
          : null
        if (active && active.projectId !== undefined && active.projectId !== next) {
          setActiveSessionId(null)
        }
      })
    }

    resolve(rootRef.current)

    const onWorkspaceChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ path?: string }>).detail
      const nextRoot =
        typeof detail?.path === 'string' && detail.path.trim().length > 0
          ? detail.path
          : scrakkProjectRoot()
      const previousRoot = rootRef.current
      rootRef.current = nextRoot
      if (sameRoot(previousRoot, nextRoot)) return

      // Ocultar YA el historial del proyecto anterior. La identidad del nuevo
      // se resuelve enseguida y el chat queda en blanco.
      scopeRef.current = null
      setScope(null)
      setActiveSessionId(null)
      resolve(nextRoot)
    }

    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => {
      disposed = true
      window.removeEventListener('workspace-changed', onWorkspaceChanged)
    }
  }, [])

  // Persistencia diferida a idle: serializar TODO el historial es caro, así
  // que se hace cuando el hilo está libre (no durante el stream). El timeout
  // es la red de seguridad si idle nunca llega.
  useEffect(() => {
    // Debounce TRAILING de verdad: durante el stream `sessions` cambia ~1 vez por
    // frame, así que esto se re-arma solo y la escritura cae ~400 ms DESPUÉS del
    // último cambio (o sea al terminar de generar). Antes se usaba
    // `requestIdleCallback(write, { timeout: 1000 })`, que dispara apenas hay un
    // hueco libre → serializaba TODA la historia ~1 vez por frame (O(n²) por
    // generación): ESE era el lag durante la IA. El flush de `beforeunload`
    // sigue cubriendo el cierre de la ventana.
    const handle = window.setTimeout(() => persistChatSessions(sessions), 400)
    return () => window.clearTimeout(handle)
  }, [sessions])

  useEffect(() => {
    const timer = setTimeout(() => persistChatActiveSession(activeSessionId), 300)
    return () => clearTimeout(timer)
  }, [activeSessionId])

  // La tool history_title de la IA pide renombrar la sesión por evento:
  // el executor no es React y no conoce el store. Se renombra la sesión
  // del `sessionId` (o la activa si no vino).
  useEffect(() => {
    const onSetTitle = (event: Event): void => {
      const detail = (event as CustomEvent<{ title?: string; sessionId?: string | null }>).detail
      const title = detail?.title?.trim().slice(0, 60)
      if (!title) return
      const target = detail?.sessionId ?? activeSessionIdRef.current
      if (!target) return
      setSessions((prev) =>
        prev.map((session) => (session.id === target ? { ...session, title } : session))
      )
    }
    window.addEventListener('set-chat-title', onSetTitle)
    return () => window.removeEventListener('set-chat-title', onSetTitle)
  }, [])

  // Flush inmediato al cerrar la ventana: no confiar solo en el debounce.
  useEffect(() => {
    const flush = (): void => {
      persistChatSessions(sessionsRef.current)
      persistChatActiveSession(activeSessionIdRef.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  const createSession = useCallback((): string => {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: t('chat.nuevo.chat'),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Si todavía se está resolviendo el proyecto queda sin id y la
      // migración lo asigna al terminar.
      projectId: scopeRef.current ?? undefined
    }
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    return session.id
  }, [])

  const selectSession = useCallback((id: string) => {
    const activeScope = scopeRef.current
    if (activeScope === null) return
    const target = sessionsRef.current.find((session) => session.id === id)
    if (!target) return
    // Nunca abrir una sesión de otro proyecto desde el historial.
    if (target.projectId !== undefined && target.projectId !== activeScope) return
    setActiveSessionId(id)
  }, [])

  const appendMessage = useCallback((sessionId: string, message: ChatMessage) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: [...session.messages, message],
              updatedAt: message.timestamp,
              // El primer mensaje del usuario nombra la sesión (como ChatGPT).
              title:
                session.title === 'Nuevo chat' && message.role === 'user'
                  ? message.content.slice(0, 48)
                  : session.title
            }
          : session
      )
    )
  }, [])

  const updateMessage = useCallback(
    (sessionId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === messageId ? updater(message) : message
                ),
                updatedAt: Date.now()
              }
            : session
        )
      )
    },
    []
  )

  const removeMessagesAfter = useCallback((sessionId: string, keepCount: number) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: session.messages.slice(0, keepCount),
              updatedAt: Date.now()
            }
          : session
      )
    )
  }, [])

  const deleteSession = useCallback((sessionId: string): void => {
    const activeScope = scopeRef.current
    const remaining = sessionsRef.current
      .filter((session) => session.id !== sessionId)
      // Elegir el siguiente chat dentro del proyecto activo (o del scope
      // global si todavía no hay proyecto).
      .filter(
        (session) =>
          activeScope === null ||
          session.projectId === activeScope ||
          session.projectId === undefined
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
    setSessions((prev) => prev.filter((session) => session.id !== sessionId))
    if (activeSessionIdRef.current === sessionId) {
      setActiveSessionId(activeScope === null ? null : (remaining[0]?.id ?? null))
    }
  }, [])

  /** Solo las sesiones del proyecto activo: el historial es independiente. */
  const visibleSessions = useMemo(
    () => (scope ? filterSessionsByProject(sessions, scope) : []),
    [sessions, scope]
  )

  const activeSession = useMemo(() => {
    if (!scope) return null
    const session = sessions.find((candidate) => candidate.id === activeSessionId)
    if (!session) return null
    return session.projectId === scope ? session : null
  }, [sessions, activeSessionId, scope])

  const value = useMemo(
    () => ({
      sessions: visibleSessions,
      projectId: scope,
      activeSessionId,
      activeSession,
      createSession,
      selectSession,
      appendMessage,
      updateMessage,
      removeMessagesAfter,
      deleteSession
    }),
    [
      visibleSessions,
      scope,
      activeSessionId,
      activeSession,
      createSession,
      selectSession,
      appendMessage,
      updateMessage,
      removeMessagesAfter,
      deleteSession
    ]
  )

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
}

export function useChats(): ChatsContextValue {
  const context = useContext(ChatsContext)
  if (!context) {
    throw new Error(t('chat.usechats.debe.usarse.dentro.de'))
  }
  return context
}
