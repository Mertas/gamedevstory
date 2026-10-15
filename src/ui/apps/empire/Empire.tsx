// ─── PLAN-52 M1/M2: «Империя» — франшизы, мерч и карточки (медиа-империя) ───
// Игра с оценкой 80+ становится франшизой: сиквелы и линии мерча растят силу бренда,
// годы забвения — съедают. Линии открываются эпохами (плюш, футболки, карточки);
// с 1996-го по линии «коллекционные карточки» раз в квартал вскрывается пак — мини-окно.
import { useMemo, useState } from 'react';
import { CONFIG } from '../../../core/config';
import { dateLabel } from '../../../shared/meta';
import { fmtK } from '../../../shared/nums';
import {
  cardPackWait,
  merchLineUnlocked,
  merchSlots,
  merchStartCost,
  merchWeekly,
  merchWeeklyEst,
} from '../../../core/systems/franchise';
import { actionCardPack, actionCardPackAck, actionMerchToggle, useGame } from '../../store';
import type { CardRarity, Franchise, MerchBudgetId, MerchLineId } from '../../../core/types';

/** 1 год, 2 года, 5 лет — по-человечески */
function yearsRu(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'год';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'года';
  return 'лет';
}

/** 0.6 → «0,6» (русская запятая в подписях вложений) */
function ruNum(x: number): string {
  return String(x).replace('.', ',');
}

const LINES: MerchLineId[] = ['figures', 'plush', 'shirts', 'cards'];
const BUDGETS: MerchBudgetId[] = ['low', 'norm', 'high'];
const RARITY_RU: Record<CardRarity, string> = { common: 'обычная', rare: 'редкая', legend: 'ЛЕГЕНДА' };

/** открытая форма запуска линии (одна на всё окно) */
interface LineForm {
  key: string;
  line: MerchLineId;
  budget: MerchBudgetId;
}

export function EmpireApp() {
  const game = useGame();
  const [form, setForm] = useState<LineForm | null>(null);

  const rows = useMemo(
    () =>
      Object.entries(game.franchises ?? {})
        .map(([key, f]) => ({ key, f }))
        .sort((a, b) => b.f.brand - a.f.brand),
    [game.franchises],
  );
  const slots = merchSlots(game);
  const activeLines = rows.reduce((a, { f }) => a + (f.merch ? 1 : 0), 0);
  const merchWeek = rows.reduce((a, { f }) => a + (f.merch ? merchWeekly(f, game.fans) : 0), 0);
  const packWait = cardPackWait(game);

  // мини-окно вскрытия: показываем последний пак, пока игрок его не подтвердил
  const lastPack = game.cards?.last && !game.cards.last.acked ? game.cards.last : null;
  const packFr = lastPack ? game.franchises?.[lastPack.franchiseKey] : undefined;

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Франшиз: <b>{rows.length}</b></span>
        <span>Линии мерча: <b>{activeLines}/{slots}</b></span>
        <span>
          Мерч:{' '}
          <b>{activeLines > 0 ? `${merchWeek >= 0 ? '+' : ''}${Math.round(merchWeek)}K/нед` : 'линии не запущены'}</b>
        </span>
      </div>
      <p className="w95-hint" style={{ margin: 0 }}>
        Игра с оценкой {CONFIG.FRANCHISE_MIN_SCORE}+ становится франшизой. Сиквелы и линии мерча растят её бренд,
        годы забвения — съедают. Линии открываются с эпохой: плюш — с 1990-го, футболки — с 1992-го,
        коллекционные карточки — с 1996-го.
      </p>
      {rows.length === 0 && (
        <p className="w95-hint" style={{ margin: 0 }}>
          Франшиз пока нет — выпустите хит на {CONFIG.FRANCHISE_MIN_SCORE}+, и о нём будут помнить десятилетиями.
        </p>
      )}
      {rows.map(({ key, f }) => (
        <FranchiseCard
          key={key}
          fkey={key}
          f={f}
          form={form}
          setForm={setForm}
          slots={slots}
          activeLines={activeLines}
          packWait={packWait}
        />
      ))}
      {lastPack && packFr && (
        <PackModal
          name={packFr.name}
          cards={lastPack.cards}
          fansGained={lastPack.fansGained}
          brandGained={lastPack.brandGained}
          onClose={() => actionCardPackAck()}
        />
      )}
    </div>
  );
}

function FranchiseCard({
  fkey, f, form, setForm, slots, activeLines, packWait,
}: {
  fkey: string;
  f: Franchise;
  form: LineForm | null;
  setForm: (v: LineForm | null) => void;
  slots: number;
  activeLines: number;
  packWait: number;
}) {
  const game = useGame();
  const idleYears = Math.floor((game.week - f.lastReleaseWeek) / CONFIG.YEAR_LENGTH);
  const week = merchWeekly(f, game.fans);
  const last = f.releases[f.releases.length - 1];
  const weakBrand = f.brand < CONFIG.MERCH_MIN_BRAND;
  const noSlots = activeLines >= slots;
  const showForm = form?.key === fkey && !f.merch;

  const lineDef = f.merch ? CONFIG.MERCH_LINES[f.merch.line] : undefined;
  const budDef = f.merch ? CONFIG.MERCH_BUDGETS[f.merch.budget] : undefined;

  return (
    <div
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
            onClick={() => actionMerchToggle(fkey)}
            data-autopilot={`empire-merch-${f.genreId}-${f.typeId}`}
          >
            Остановить линию ({lineDef?.name} · {budDef?.name}; ≈{week >= 0 ? '+' : ''}{Math.round(week)}K/нед)
          </button>
        ) : weakBrand ? (
          <span className="w95-hint">линия мерча — когда бренд дорастёт до {CONFIG.MERCH_MIN_BRAND}</span>
        ) : noSlots ? (
          <span className="w95-hint">все линии заняты ({activeLines}/{slots}) — сначала остановите другую</span>
        ) : !showForm ? (
          <button
            type="button"
            className="w95-btn"
            onClick={() => setForm({ key: fkey, line: 'figures', budget: 'norm' })}
            data-autopilot={`empire-merch-${f.genreId}-${f.typeId}`}
          >
            Запустить линию мерча…
          </button>
        ) : (
          <LineFormView fkey={fkey} f={f} form={form} setForm={setForm} />
        )}
      </div>
      {f.merch?.line === 'cards' && (
        <div className="w95-row" style={{ justifyContent: 'space-between' }}>
          {packWait > 0 ? (
            <span className="w95-hint">свежий пак карточек — через {packWait} нед.</span>
          ) : (
            <button
              type="button"
              className="w95-btn"
              disabled={game.money < CONFIG.CARD_PACK_COST}
              onClick={() => actionCardPack(fkey)}
              data-autopilot={`empire-pack-${f.genreId}-${f.typeId}`}
            >
              Вскрыть пак карточек ({fmtK(CONFIG.CARD_PACK_COST)})
            </button>
          )}
          {packWait === 0 && game.money < CONFIG.CARD_PACK_COST && (
            <span className="w95-hint">на пак нужно {fmtK(CONFIG.CARD_PACK_COST)}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** форма запуска: линия (по эпохам) + вложения (цена/доход/бренд) */
function LineFormView({
  fkey, f, form, setForm,
}: {
  fkey: string;
  f: Franchise;
  form: LineForm;
  setForm: (v: LineForm | null) => void;
}) {
  const game = useGame();
  const bd = CONFIG.MERCH_BUDGETS[form.budget];
  const cost = merchStartCost(form.line, form.budget);
  const est = merchWeeklyEst(game.fans, f.brand, form.line, form.budget);
  const poor = game.money < cost;

  return (
    <div className="w95-panel w95-bevel-in" style={{ padding: '6px 8px', gap: 4 }}>
      <div className="w95-row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <span className="w95-hint" style={{ minWidth: 52 }}>Линия:</span>
        {LINES.map((l) => {
          const def = CONFIG.MERCH_LINES[l];
          const unlocked = merchLineUnlocked(game, l);
          return (
            <button
              key={l}
              type="button"
              className={form.line === l ? 'w95-btn active' : 'w95-btn'}
              disabled={!unlocked}
              title={unlocked ? '' : `появится в ${def.unlockYear}-м`}
              onClick={() => setForm({ ...form, line: l })}
            >
              {def.name}{unlocked ? '' : ` · ${def.unlockYear}`}
            </button>
          );
        })}
      </div>
      <div className="w95-row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <span className="w95-hint" style={{ minWidth: 52 }}>Вложения:</span>
        {BUDGETS.map((b) => (
          <button
            key={b}
            type="button"
            className={form.budget === b ? 'w95-btn active' : 'w95-btn'}
            onClick={() => setForm({ ...form, budget: b })}
          >
            {CONFIG.MERCH_BUDGETS[b].name}
          </button>
        ))}
      </div>
      <span className="w95-hint">
        {bd.name}: цена ×{ruNum(bd.costMult)}, доход ×{ruNum(bd.incomeMult)}, бренд {bd.brandOnStart >= 0 ? '+' : ''}{bd.brandOnStart}
      </span>
      <div className="w95-row" style={{ justifyContent: 'space-between' }}>
        <span className="w95-hint">
          Запуск: {fmtK(cost)} · ≈{est >= 0 ? '+' : ''}{Math.round(est)}K/нед
          {poor ? ` · не хватает ${fmtK(cost - game.money)}` : ''}
        </span>
        <div className="w95-row" style={{ gap: 4 }}>
          <button
            type="button"
            className="w95-btn"
            disabled={poor}
            onClick={() => {
              actionMerchToggle(fkey, form.line, form.budget);
              setForm(null);
            }}
          >
            Запустить линию
          </button>
          <button type="button" className="w95-btn" onClick={() => setForm(null)}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

/** мини-окно вскрытия пака: карты вскрываются одна за другой */
function PackModal({
  name, cards, fansGained, brandGained, onClose,
}: {
  name: string;
  cards: { rarity: CardRarity; name: string }[];
  fansGained: number;
  brandGained: number;
  onClose: () => void;
}) {
  const legends = cards.filter((c) => c.rarity === 'legend').length;
  return (
    <div className="w95-modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
      <div className="w95-window focused" style={{ position: 'relative', width: 480, zIndex: 901 }}>
        <div className="w95-title">🃏 Свежий пак — «{name}»</div>
        <div className="w95-body" style={{ padding: 10, gap: 8 }}>
          <div className="pack-grid">
            {cards.map((c, i) => (
              <div
                key={i}
                className={`pack-card pack-card-${c.rarity}`}
                style={{ animationDelay: `${i * 0.14}s` }}
              >
                <b>{RARITY_RU[c.rarity]}</b>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
          <p className="w95-hint" style={{ margin: 0 }}>
            {legends > 0 ? 'Легендарка! Мем разошёлся по сети. ' : ''}
            +{fansGained} фанатов{brandGained > 0 ? `, бренд +${brandGained}` : ''}.
          </p>
          <div className="w95-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="w95-btn" onClick={onClose}>
              Забрать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
