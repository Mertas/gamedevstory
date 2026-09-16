// ─── Железо: своя консоль — форма с живой сметой, сроком и требованиями ───
import { useState } from 'react';
import { actionStartOwnConsole, useGame } from '../../store';
import { fmtK } from '../../../shared/nums';
import { OWN_CONSOLE_TYPES, OWN_CONSOLE_CPUS, OWN_CONSOLE_MEDIA, ownConsoleDays } from '../../../shared/consoles';

export function OwnConsolePanel() {
  const game = useGame();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'console' | 'portable'>('console');
  const [cpu, setCpu] = useState('16-bit');
  const [media, setMedia] = useState('cartridge');

  // уже строим — показываем ход работ
  if (game.ownConsole) {
    const oc = game.ownConsole;
    const leftWeeks = Math.max(0, Math.ceil((oc.weeksTotal - oc.progress) / 7));
    return (
      <div className="w95-bevel-in" style={{ padding: 8, display: 'grid', gap: 4 }}>
        <b>🛠 «{oc.name}» — в разработке</b>
        <div className="w95-progress">
          <div style={{ width: `${Math.min(100, (oc.progress / oc.weeksTotal) * 100)}%` }} />
        </div>
        <div className="w95-hint">
          {Math.round(oc.progress / 7)}/{Math.round(oc.weeksTotal / 7)} нед. · осталось ~{leftWeeks} нед. · затраты {fmtK(oc.cost)}
        </div>
        <div className="w95-hint">Готовая консоль не снимается с производства; база растёт с релизами под неё.</div>
      </div>
    );
  }

  const typeD = OWN_CONSOLE_TYPES.find((t) => t.id === kind) ?? OWN_CONSOLE_TYPES[0];
  const cpuD = OWN_CONSOLE_CPUS.find((t) => t.id === cpu) ?? OWN_CONSOLE_CPUS[0];
  const mediaD = OWN_CONSOLE_MEDIA.find((t) => t.id === media) ?? OWN_CONSOLE_MEDIA[0];
  const hwCount = game.staff.filter((s) => s.activeCareer === 'hw').length;
  const needHw = Math.max(1, cpuD.hw, mediaD.hw);
  const cost = typeD.cost + cpuD.cost + mediaD.cost;
  const weeks = Math.round(
    ownConsoleDays(OWN_CONSOLE_CPUS.findIndex((t) => t.id === cpu), OWN_CONSOLE_MEDIA.findIndex((t) => t.id === media)) / 7,
  );
  const officeOk = game.officeLevel >= 3;
  const hwOk = hwCount >= needHw;
  const moneyOk = game.money >= cost;
  const ready = officeOk && hwOk && moneyOk;
  const reason = !officeOk
    ? 'Нужен офис 3'
    : !hwOk
      ? `Нужно хардвер-инженеров: ${needHw} (сейчас ${hwCount})`
      : !moneyOk
        ? `Нужно ${fmtK(cost)}`
        : '';

  return (
    <div className="w95-bevel-in" style={{ padding: 8, display: 'grid', gap: 4 }}>
      <b>🕹 Своя консоль</b>
      <div className="w95-hint">
        Своя консоль не снимается с производства; база растёт с релизами под неё (+93K за игру).
        Строим только одну за раз.
      </div>
      <div className="w95-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span>Название:</span>
        <input
          className="w95-input"
          data-autopilot="own-console-name"
          style={{ flex: 1, minWidth: 140 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Студийная консоль"
        />
      </div>
      <div className="w95-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span>Тип:</span>
        <select className="w95-input" data-autopilot="own-console-type" value={kind} onChange={(e) => setKind(e.target.value as 'console' | 'portable')}>
          {OWN_CONSOLE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — {fmtK(t.cost)}</option>)}
        </select>
        <span>CPU:</span>
        <select className="w95-input" data-autopilot="own-console-cpu" value={cpu} onChange={(e) => setCpu(e.target.value)}>
          {OWN_CONSOLE_CPUS.map((t) => (
            <option key={t.id} value={t.id}>{t.label} — {fmtK(t.cost)}{t.hw > 1 ? ` (нужно ${t.hw} инж.)` : ''}</option>
          ))}
        </select>
        <span>Носитель:</span>
        <select className="w95-input" data-autopilot="own-console-media" value={media} onChange={(e) => setMedia(e.target.value)}>
          {OWN_CONSOLE_MEDIA.map((t) => (
            <option key={t.id} value={t.id}>{t.label} — {fmtK(t.cost)}{t.hw > 1 ? ` (нужно ${t.hw} инж.)` : ''}</option>
          ))}
        </select>
      </div>
      <div>
        <b>Итого: {fmtK(cost)}</b> · срок ~{weeks} нед. · хардвер-инженеров: {hwCount}/{needHw}
      </div>
      <div className="w95-hint">
        Требования: офис 3 — {officeOk ? '✓' : `✗ (сейчас ${game.officeLevel})`}
        {' · '}инженеры — {hwOk ? '✓' : `✗ (${hwCount}/${needHw})`}
        {' · '}деньги — {moneyOk ? '✓' : `✗ (нужно ${fmtK(cost)})`}
      </div>
      <button
        className="w95-btn"
        data-autopilot="own-console-start"
        disabled={!ready}
        title={reason || undefined}
        onClick={() => actionStartOwnConsole(name, kind, cpu, media)}
      >
        Начать разработку ({fmtK(cost)}, ~{weeks} нед.)
      </button>
    </div>
  );
}
