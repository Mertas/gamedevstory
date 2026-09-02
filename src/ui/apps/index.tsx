// Реестр приложений рабочего стола.
import type { ComponentType } from 'react';
import { ChatApp } from './ChatApp';
import { CodeApp } from './CodeApp';
import {
  ArchiveApp, ContractsApp, HardwareApp, HelpApp, HireApp, MagazinesApp,
  MailApp, MarketingApp, ResearchApp,
} from './OtherApps';

export interface AppDef {
  id: string;
  title: string;
  icon: string;
  component: ComponentType;
}

export const APP_DEFS: AppDef[] = [
  { id: 'code', title: 'Код', icon: '🖥️', component: CodeApp },
  { id: 'chat', title: 'Чат', icon: '💬', component: ChatApp },
  { id: 'hire', title: 'Найм', icon: '👥', component: HireApp },
  { id: 'archive', title: 'Архив', icon: '🗄️', component: ArchiveApp },
  { id: 'hardware', title: 'Железо', icon: '🎮', component: HardwareApp },
  { id: 'research', title: 'Исследования', icon: '🔬', component: ResearchApp },
  { id: 'magazines', title: 'Журналы', icon: '📰', component: MagazinesApp },
  { id: 'marketing', title: 'Маркетинг', icon: '📣', component: MarketingApp },
  { id: 'contracts', title: 'Контракты', icon: '📝', component: ContractsApp },
  { id: 'mail', title: 'Почта', icon: '✉️', component: MailApp },
  { id: 'help', title: 'Справка', icon: '❓', component: HelpApp },
];
