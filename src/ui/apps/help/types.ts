// Справка: типы разделов (v1.36.0, 28.09.2026).
import type { ReactNode } from 'react';

export interface HelpSection {
  /** якорь раздела (data-autopilot="help-nav-<id>" / обработка клика) */
  id: string;
  icon: string;
  title: string;
  /** ленивый рендер статьи — контент строится только для открытого раздела */
  body: () => ReactNode;
}
