// ─── Железо: своя консоль ───
import { useState } from 'react';
import { actionStartOwnConsole, useGame } from '../../store';

const OC_TYPES = [
  { id: 'console', label: 'Стационарная (6,000K)' },
  { id: 'portable', label: 'Портативная (4,000K)' },
];
const OC_CPUS = [
  { id: '16-bit', label: '16-бит чип (1,000K)' },
  { id: '32-bit', label: '32-бит чип (10,000K)' },
  { id: '64-bit', label: '64-бит чип (50,000K)' },
  { id: 'potato-chip', label: 'Чип «Картошка» (90,000K, 4 инж.)' },
];
const OC_MEDIA = [
  { id: 'cartridge', label: 'Картридж (3,000K)' },
  { id: 'cd', label: 'CD-ROM (5,000K)' },
  { id: 'dvd', label: 'DVD-ROM (15,000K)' },
  { id: 'bd', label: 'BD-ROM (35,000K)' },
  { id: 'punch-cards', label: 'Перфокарты (93,999.9K, 6 инж.)' },
];

export function OwnConsolePanel() {
  const game = useGame();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('console');
  const [cpu, setCpu] = useState('16-bit');
  const [media, setMedia] = useState('cartridge');
  const hwCount = game.staff.filter((s) => s.activeCareer === 'hw').length;
  const cost = 6000 + 1000 + 3000;

  if (game.ownConsole) {
    return (
      <div className="w95-bevel-in" style={{ padding: 8 }}>
        <b>🛠 «{game.ownConsole.name}» в разработке</b>
        <div className="w95-progress" style={{ marginTop: 4 }}>
          <div style={{ width: `${Math.min(100, (game.ownConsole.progress / game.ownConsole.weeksTotal) * 100)}%` }} />
        </div>
        <div className="w95-hint">{game.ownConsole.progress}/{game.ownConsole.weeksTotal} недель</div>
      </div>
    );
  }
  return (
    <div className="w95-bevel-in" style={{ padding: 8 }}>
      <b>🕹 Своя консоль</b>
      <div className="w95-hint">
        Требуется: офис 3, ≥1 хардвер-инженер (сейчас: {hwCount});
        топ-компоненты — 4/6 инженеров. Своя консоль снимает старую.
      </div>
      <div className="w95-row">
        <span>Название:</span>
        <input className="w95-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Студийная консоль" />
      </div>
      <div className="w95-row">
        <span>Тип:</span>
        <select className="w95-input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {OC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span>CPU:</span>
        <select className="w95-input" value={cpu} onChange={(e) => setCpu(e.target.value)}>
          {OC_CPUS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span>Носитель:</span>
        <select className="w95-input" value={media} onChange={(e) => setMedia(e.target.value)}>
          {OC_MEDIA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <button
        className="w95-btn"
        disabled={game.officeLevel < 3 || hwCount < 1 || game.money < cost}
        onClick={() => actionStartOwnConsole(name, kind, cpu, media)}
      >
        Начать разработку (от {cost}K)
      </button>
    </div>
  );
}
