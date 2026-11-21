// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import { t } from '@core/i18n'
import { PreviewPlaceholder } from '../_shared/PreviewPlaceholder'

/** Placeholder de binarios/ejecutables (ELF, EXE, DLL, SO…). Nunca se ejecutan. */
export default function BinaryPlaceholder(): JSX.Element {
  return (
    <PreviewPlaceholder
      icon="code"
      title={t('features.preview.binario.no.disponible')}
      hint={t('features.preview.binario.pronto')}
    />
  )
}
