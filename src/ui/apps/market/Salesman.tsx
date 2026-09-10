// Продавец: бустеры, Dead Bull, Career Manual
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import { CAREER_LABELS } from '../../careers';
import { actionBuyBooster, actionBuyCareerManual, actionBuyDeadBull, useGame, useMeta } from '../../store';

export function SalesmanPanel() {
  const game = useGame();
  const meta = useMeta();
  const [staffId, setStaffId] = useState('');
  const [manualTarget, setManualTarget] = useState('director');
  if (!game.salesmanHere) {
    return <div className="w95-hint">Продавец Тыквенных Продуктов приходит в первую неделю мая (с года 2).</div>;
  }
  const boosterDefs = [
    { id: 'fun', label: 'Fun-бустер' },
    { id: 'creativity', label: 'Creativity-бустер' },
    { id: 'graphics', label: 'Graphics-бустер' },
    { id: 'sound', label: 'Sound-бустер' },
  ];
  const deadBullPrice = CONFIG.DEAD_BULL_PRICE[game.officeLevel - 1] ?? 550;
  const manualPrice = CONFIG.CAREER_MANUAL_PRICE[game.officeLevel - 1] ?? 550;
  return (
    <>
      <b>🛒 Тыквенные Продукты</b>
      <div className="w95-hint">Бустеры добавляют очки к текущей разработке (применяются в окне «Код»).</div>
      <table className="w95-table">
        <tbody>
          {boosterDefs.map((b) => {
            const n = game.boosterPurchases[b.id] ?? 0;
            const price = meta.boosterPrices.find((p) => p.office === game.officeLevel && p.purchaseNo === n + 1)?.price;
            return (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td>{price === undefined ? 'распродано' : `${price}K`}</td>
                <td><button className="w95-btn" data-autopilot={`booster-${b.id}`} disabled={price === undefined || game.money < (price ?? 0)} onClick={() => actionBuyBooster(b.id)}>Купить</button></td>
              </tr>
            );
          })}
          <tr>
            <td>Dead Bull <span className="w95-hint">(+POWER, +10 PR)</span></td>
            <td>{deadBullPrice}K</td>
            <td>
              <select className="w95-input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">— сотрудник —</option>
                {game.staff.map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
              </select>
              <button className="w95-btn" disabled={!staffId} onClick={() => staffId && actionBuyDeadBull(staffId)}>Купить</button>
            </td>
          </tr>
          <tr>
            <td>Руководство по смене профессии</td>
            <td>{manualPrice}K</td>
            <td>
              <select className="w95-input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">— сотрудник —</option>
                {game.staff.map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
              </select>
              <select className="w95-input" value={manualTarget} onChange={(e) => setManualTarget(e.target.value)}>
                {['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'].map((c) => <option key={c} value={c}>{CAREER_LABELS[c] ?? c}</option>)}
              </select>
              <button className="w95-btn" disabled={!staffId} onClick={() => staffId && actionBuyCareerManual(staffId, manualTarget)}>Купить</button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
