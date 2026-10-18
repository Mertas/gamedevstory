// ─── Найм: вкладки Команда / Профессии / Обучение / Продавец (UI-08: разрез на hire/, staff/, market/) ───
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import { useGame } from '../../store';
import { TeamTab } from '../staff/TeamTab';
import { SearchTab } from './SearchTab';
import { TrainingTab } from './TrainingTab';
import { ProfessionsTab } from './ProfessionsTab';
import { SalesmanPanel } from '../market/Salesman';

export function HireApp() {
  const game = useGame();
  const [tab, setTab] = useState<'team' | 'careers' | 'training' | 'salesman'>('team');
  const seats = game.seats ?? CONFIG.STAFF_SEATS_BASE; // PLAN-53: места покупаются по одному
  const officeFull = game.staff.length >= seats;

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%', gap: 4 }}>
      <div className="w95-tabs">
        {([['team', 'Команда'], ['careers', 'Профессии'], ['training', 'Обучение'], ['salesman', 'Продавец']] as const).map(([id, label]) => (
          <button key={id} className={`w95-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)} data-autopilot={`hire-tab-${id}`}>{label}</button>
        ))}
        {game.salesmanHere && <span style={{ color: '#c00000', fontSize: 10, alignSelf: 'center' }}>🛒 продавец здесь!</span>}
        <span className="w95-hint" style={{ fontSize: 10, alignSelf: 'center', marginLeft: 'auto', color: officeFull ? '#c00000' : undefined }}>
          Мест: {game.staff.length}/{seats}{officeFull ? ' — нет свободных!' : ''}
        </span>
      </div>

      {tab === 'team' && (
        <>
          <TeamTab />
          <SearchTab />
        </>
      )}

      {tab === 'careers' && <ProfessionsTab />}

      {tab === 'training' && <TrainingTab />}

      {tab === 'salesman' && (
        <SalesmanPanel />
      )}

    </div>
  );
}
