// Реестр приложений рабочего стола.
// UI-01: все приложения обёрнуты в memo — ререндер Desktop (тик/драг/снапшот)
// не тянет за собой содержимое окон без изменения их собственных пропсов.
import { memo, type ComponentType } from 'react';
import { ChatApp } from './ChatApp';
import { CodeApp } from './CodeApp';
import { ArchiveApp } from './archive/Archive';
import { ContractsApp } from './market/Contracts';
import { HardwareApp } from './market/Hardware';
import { HelpApp } from './help/Help';
import { HireApp } from './hire/HireApp';
import { MagazinesApp } from './archive/Magazines';
import { MailApp } from './mail/Mail';
import { MarketingApp } from './market/Marketing';
import { ResearchApp } from './research/Research';

export interface AppDef {
  id: string;
  title: string;
  icon: string;
  component: ComponentType;
}

export const APP_DEFS: AppDef[] = [
  { id: 'code', title: 'Код', icon: '🖥️', component: memo(CodeApp) },
  { id: 'chat', title: 'Чат', icon: '💬', component: memo(ChatApp) },
  { id: 'hire', title: 'Найм', icon: '👥', component: memo(HireApp) },
  { id: 'archive', title: 'Архив', icon: '🗄️', component: memo(ArchiveApp) },
  { id: 'hardware', title: 'Железо', icon: '🎮', component: memo(HardwareApp) },
  { id: 'research', title: 'Исследования', icon: '🔬', component: memo(ResearchApp) },
  { id: 'magazines', title: 'Журналы', icon: '📰', component: memo(MagazinesApp) },
  { id: 'marketing', title: 'Маркетинг', icon: '📣', component: memo(MarketingApp) },
  { id: 'contracts', title: 'Контракты', icon: '📝', component: memo(ContractsApp) },
  { id: 'mail', title: 'Почта', icon: '✉️', component: memo(MailApp) },
  { id: 'help', title: 'Справка', icon: '❓', component: memo(HelpApp) },
];
