// ─── PLAN-52 M1: «Империя» — франшизы и мерч (медиа-империя, этап 1) ───
// Игра с оценкой 80+ становится франшизой: сиквелы и мерч растят силу бренда,
// годы забвения — съедают. Это портфель серий, а не список игр (для них есть «Архив»).
import { useMemo } from 'react';
import { CONFIG } from '../../../core/config';
import { dateLabel } from '../../../shared/meta';
import { fmtK } from '../../../shared/nums';
import { merchWeekly } from '../../../core/systems/franchise';
import { actionMerchToggle, useGame } from '../../store';

/** 1 год, 2 года, 5 лет — по-человечески */
function yearsRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'год';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'года';
  return 'лет';
}

export function EmpireApp() {
  const game = useGame();
  const rows = useMemo(
    () =>
      Object.entries(game.franchises ?? {})
        .map(([key, f]) => ({ key, f }))
        .sort((a, b) => b.f.brand - a.f.brand),
    [game.franchises],
  );
  const merchWeek = rows.reduce((a, { f }) => a + (f.merch ? merchWeekly(f, game.fans) : 0), 0);
  const merchOn = rows.some(({ f }) => f.merch);

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Франшиз: <b>{rows.length}</b></span>
        <span>
          Мерч:{' '}
          <b>{merchOn ? `${merchWeek >= 0 ? '+' : ''}${Math.round(merchWeek)}K/нед` : 'линии не запущены'}</b>
        </span>
      </div>
      <p className="w95-hint" style={{ margin: 0 }}>
        Игра с оценкой {CONFIG.FRANCHISE_MIN_SCORE}+ становится франшизой. Сиквелы и мерч растят её бренд,
        годы забвения — съедают: о серии нужно заботиться.
      </p>
      {rows.length === 0 && (
        <p className="w95-hint" style={{ margin: 0 }}>
          Франшиз пока нет — выпустите хит на {CONFIG.FRANCHISE_MIN_SCORE}+, и о нём будут помнить десятилетиями.
        </p>
      )}
      {rows.map(({ key, f }) => {
        const idleYears = Math.floor((game.week - f.lastReleaseWeek) / CONFIG.YEAR_LENGTH);
        const week = merchWeekly(f, game.fans);
        const last = f.releases[f.releases.length - 1];
        const weakBrand = f.brand < CONFIG.MERCH_MIN_BRAND;
        const poor = game.money < CONFIG.MERCH_START_COST;
        return (
          <div
            key={key}
            className="w95-panel w95-bevel-out"
            style={{ padding: '6px 8px', gap: 4 }}
            data-autopilot={`empire-card-${f.genreId}-${f.typeId}`}
          >
            <div className="w95-row" style={{ justifyContent: 'space-between' }}>
              <b>«{f.name}»</b>
              <span>бренд <b>{Math.round(f.brand)}</b>/100</span>
            </div>
            <div className="w95-row">
              <div style={{ flex: 1, height: 8, background: '#fff', border: '1px solid #808080' }}>
                <div style={{ width: `${Math.round(f.brand)}%`, height: '100%', background: '#000080' }} />
              </div>
            </div>
            <div className="w95-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className="w95-hint">
                релизов: {f.releases.length} · последний — {Math.round(last?.score ?? f.brand)}/100
                ({dateLabel(last?.week ?? f.bornWeek)})
                {idleYears >= 1 ? ` · ${idleYears} ${yearsRu(idleYears)} без продолжения` : ''}
              </span>
              {f.merch ? (
                <button
                  type="button"
                  className="w95-btn"
                  onClick={() => actionMerchToggle(key)}
                  data-autopilot={`empire-merch-${f.genreId}-${f.typeId}`}
                >
                  Остановить линию (≈{week >= 0 ? '+' : ''}{Math.round(week)}K/нед)
                </button>
              ) : weakBrand ? (
                <span className="w95-hint">линия мерча — когда бренд дорастёт до {CONFIG.MERCH_MIN_BRAND}</span>
              ) : poor ? (
                <span className="w95-hint">на запуск линии нужно {fmtK(CONFIG.MERCH_START_COST)}</span>
              ) : (
                <button
                  type="button"
                  className="w95-btn"
                  onClick={() => actionMerchToggle(key)}
                  data-autopilot={`empire-merch-${f.genreId}-${f.typeId}`}
                >
                  Запустить линию мерча ({fmtK(CONFIG.MERCH_START_COST)}, ≈{week >= 0 ? '+' : ''}{Math.round(week)}K/нед)
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
