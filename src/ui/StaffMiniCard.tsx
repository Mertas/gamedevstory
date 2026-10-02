// Мини-карточка сотрудника/кандидата (запрос игрока 28.09.2026): клик по кандидату в найме
// показывает компактную карточку — аватар, имя, активная профессия, характер, характеристики и
// ВСЕ профессии с уровнями (активная — тёмной плашкой; обязательное требование).
// Тип — структурный минимум: подходит и Staff (сотрудник), и кандидат из meta.staff (без power).
import type { ReactNode } from 'react';
import type { CareerId } from '../core/data/schema';
import { CAREER_LABELS, CAREER_ORDER } from '../shared/careers';
import { AV, StaffAvatar } from './StaffAvatar';

export interface MiniStaff {
  id: string;
  name: string;
  gender: string;
  activeCareer: CareerId;
  careers: Record<CareerId, number>;
  stats: { program: number; scenario: number; graphics: number; sound: number };
  /** у кандидата из меты нет фактического POWER — показываем максимум */
  power?: number;
  maxPower: number;
}

export interface StaffMiniCardProps {
  st: MiniStaff;
  /** Характер (persona из meta.staff) — опционально. */
  persona?: string | null;
  /** Доп. строка под карточкой (взнос/зарплата и т.п.). */
  footer?: ReactNode;
}

export function StaffMiniCard({ st, persona, footer }: StaffMiniCardProps) {
  const lv = st.careers[st.activeCareer] ?? 0;
  const power = st.power ?? st.maxPower;
  // профессии: все ненулевые + активная (даже если 0)
  const shown = CAREER_ORDER.filter((c) => (st.careers[c] ?? 0) > 0 || c === st.activeCareer);
  return (
    <div className="w95-minicard" data-autopilot="hire-minicard">
      <div className="w95-minicard-avatar">
        <StaffAvatar staff={st} variant={AV.hirePreview} fallback={<span>{st.gender === 'F' ? '👩' : '👨'}</span>} />
      </div>
      <div className="w95-minicard-body">
        <div>
          <b>{st.name}</b>{' '}
          <span className="w95-hint">{CAREER_LABELS[st.activeCareer] ?? st.activeCareer} Lv{lv} · POWER {power}/{st.maxPower}</span>
        </div>
        {persona && <div className="w95-hint" style={{ fontStyle: 'italic' }}>{persona}</div>}
        <div style={{ fontSize: 11, marginTop: 2 }}>
          Пр {st.stats.program} · Сц {st.stats.scenario} · Гр {st.stats.graphics} · Зв {st.stats.sound}
        </div>
        <div className="w95-hint" style={{ marginTop: 2 }}>Профессии:</div>
        <div>
          {shown.map((c) => (
            <span key={c} className={`w95-career-chip${c === st.activeCareer ? ' on' : ''}`}>
              {CAREER_LABELS[c] ?? c} Lv{st.careers[c] ?? 0}
            </span>
          ))}
        </div>
        {footer}
      </div>
    </div>
  );
}
