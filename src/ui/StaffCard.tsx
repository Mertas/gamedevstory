// Карточка сотрудника для выбора (обучение, команда проекта).
// Аватар, имя, профессия+уровень, усталость (POWER-полоска), параметры.
import type { Staff } from '../core/types';
import { CAREER_LABELS } from './careers';
import { StaffAvatar } from './StaffAvatar';

export interface StaffCardProps {
  st: Staff;
  selected?: boolean;
  disabled?: boolean;
  note?: string; // доп. подпись, напр. «сейчас: Сценарий»
  onClick?: () => void;
}

export function staffCardTitle(st: Staff): string {
  return `${CAREER_LABELS[st.activeCareer] ?? st.activeCareer} Lv${st.careers[st.activeCareer] ?? 0}`;
}

export function StaffCard({ st, selected, disabled, note, onClick }: StaffCardProps) {
  const lv = st.careers[st.activeCareer] ?? 0;
  const pct = Math.max(0, Math.min(1, st.maxPower > 0 ? st.power / st.maxPower : 0));
  const powerColor = pct > 0.5 ? '#1a7a1a' : pct > 0.25 ? '#b08a00' : '#c00000';
  return (
    <div
      className={`w95-staff-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      data-staff-id={st.id}
      onClick={disabled ? undefined : onClick}
      title={disabled ? 'Сотрудник вымотался (POWER 0)' : undefined}
    >
      <div className="w95-staff-avatar">
        <StaffAvatar staff={st} fallback={<span>👤</span>} />
      </div>
      <div className="w95-staff-name">{st.name}</div>
      <div className="w95-staff-sub">{CAREER_LABELS[st.activeCareer] ?? st.activeCareer} Lv{lv}</div>
      <div className="w95-staff-power">
        <div style={{ width: `${Math.round(pct * 100)}%`, background: powerColor }} />
      </div>
      <div className="w95-staff-power-label">POWER {st.power}/{st.maxPower}</div>
      <div className="w95-staff-stats">
        <span>П{st.stats.program}</span>
        <span>С{st.stats.scenario}</span>
        <span>Г{st.stats.graphics}</span>
        <span>З{st.stats.sound}</span>
      </div>
      {note && <div className="w95-staff-note">{note}</div>}
    </div>
  );
}
