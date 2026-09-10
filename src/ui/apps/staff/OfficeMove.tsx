// ─── Найм: переезд офиса (кнопка во вкладке «Команда») — UI-08: вынесено из OtherApps.tsx ───
import { actionMoveOffice, useGame } from '../../store';

export function OfficeMove() {
  const game = useGame();
  if (game.officeLevel >= 3) return null;
  if (game.officeLevel === 1) {
    const readyYear = game.year >= 4;
    const readyMoney = game.money >= 1000;
    const readyRelease = game.history.length > 0;
    const ready = readyYear && readyMoney && readyRelease;
    const lacks = [
      !readyYear ? `год 4+ (сейчас ${game.year})` : null,
      !readyMoney ? `≥1000K (есть ${Math.round(game.money)}K)` : null,
      !readyRelease ? 'хотя бы один релиз' : null,
    ].filter(Boolean) as string[];
    return (
      <div className="w95-row">
        <button className="w95-btn" disabled={!ready || game.money < 600} data-autopilot="office-move" onClick={() => actionMoveOffice()}>
          🏢 Переехать в офис 2 (600K)
        </button>
        <span className="w95-hint" style={{ color: ready ? undefined : '#000' }}>
          {ready ? (game.money < 600 ? 'не хватает на переезд — нужно ещё 600K' : 'можно переезжать!') : `пока нельзя: ${lacks.join(', ')}`}
        </span>
      </div>
    );
  }
  // офис 3: 7-й год и 3500K на счету
  const readyYear = game.year >= 7;
  const readyMoney = game.money >= 3500;
  const ready = readyYear && readyMoney;
  const lacks = [
    !readyYear ? `7-й год (осталось ${7 - game.year} г.)` : null,
    !readyMoney ? `3500K на счету (есть ${Math.round(game.money)}K)` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="w95-row">
      <button className="w95-btn" disabled={!ready || game.money < 2500} data-autopilot="office-move" onClick={() => actionMoveOffice()}>
        🏢 Переехать в офис 3 (2,500K)
      </button>
      <span className="w95-hint">
        {ready ? (game.money < 2500 ? 'не хватает на переезд — нужно ещё 2,500K' : 'можно переезжать!') : `пока нельзя: ${lacks.join(', ')}`}
      </span>
    </div>
  );
}
