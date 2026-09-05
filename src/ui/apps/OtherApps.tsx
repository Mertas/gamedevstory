// Прочие приложения: Найм, Архив, Железо, Маркетинг, Контракты, Исследования, Журналы, Почта, Справка.
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../core/config';
import type { HireMethodId } from '../../core/config';
import { candidatePool, dateLabel } from '../../shared/meta';
import {
  actionBuyAd, actionBuyBooster, actionBuyCareerManual, actionBuyDeadBull, actionBuyLicense, actionChangeCareer,
  actionFire, actionHire, actionLevelUp, actionMoveOffice, actionStartOwnConsole,
  actionTakeContract, actionTrain, useGame, useMeta,
} from '../store';
import { useWindows } from '../wm';

const METHOD_LABELS: Record<HireMethodId, string> = {
  'word-of-mouth': 'По знакомству ($50K)',
  magazine: 'Объявление в журнале ($120K)',
  online: 'Объявление в интернете ($550K)',
  vocational: 'Профучилище ($800K)',
  'open-house': 'День открытых дверей ($1,800K)',
  hollywood: 'Голливуд ($3,500K)',
};

import { CAREER_LABELS } from '../careers';
import { StaffCard } from '../StaffCard';

// ─── Найм (вкладки: Команда / Обучение / Продавец) ───
export function HireApp() {
  const game = useGame();
  const meta = useMeta();
  const [tab, setTab] = useState<'team' | 'training' | 'salesman'>('team');
  const [method, setMethod] = useState<HireMethodId>('word-of-mouth');
  const [trainStaffId, setTrainStaffId] = useState('');
  const [careerFor, setCareerFor] = useState<string>('');

  const cfg = CONFIG.HIRE_METHODS[method];
  const pool = candidatePool(game, meta, cfg.pool);
  // места в офисе: кнопки найма гаснут, когда офис полон
  const officeCap = CONFIG.OFFICE_CAPACITY[game.officeLevel] ?? 4;
  const officeFull = game.staff.length >= officeCap;
  const candidates = pool.slice(0, 3).map((id) => meta.staff.find((d) => d.id === id)).filter(Boolean);
  const s = game.staff.find((x) => x.id === careerFor);

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%', gap: 4 }}>
      <div className="w95-tabs">
        {([['team', 'Команда'], ['training', 'Обучение'], ['salesman', 'Продавец']] as const).map(([id, label]) => (
          <button key={id} className={`w95-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
        {game.salesmanHere && <span style={{ color: '#c00000', fontSize: 10, alignSelf: 'center' }}>🛒 продавец здесь!</span>}
        <span className="w95-hint" style={{ fontSize: 10, alignSelf: 'center', marginLeft: 'auto', color: officeFull ? '#c00000' : undefined }}>
          Офис: {game.staff.length}/{officeCap}{officeFull ? ' — полон!' : ''}
        </span>
      </div>

      {tab === 'team' && (
        <>
          <b>Команда ({game.staff.length}/{CONFIG.OFFICE_CAPACITY[game.officeLevel]})</b>
          <table className="w95-table">
            <thead>
              <tr><th>Сотрудник</th><th>Профессия</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th>POWER</th><th>Зарплата</th><th>Действия</th><th></th></tr>
            </thead>
            <tbody>
              {game.staff.map((st) => {
                const lv = st.careers[st.activeCareer] ?? 0;
                const price = CONFIG.LEVEL_PR[st.activeCareer]?.[lv - 1];
                return (
                  <tr key={st.id}>
                    <td>
                      <span className="w95-row">
                        {st.avatar ? <img src={st.avatar} alt="" style={{ width: 20, height: 20 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
                        {st.name}
                      </span>
                    </td>
                    <td>{CAREER_LABELS[st.activeCareer] ?? st.activeCareer} Lv{lv}</td>
                    <td>{st.stats.program}</td>
                    <td>{st.stats.scenario}</td>
                    <td>{st.stats.graphics}</td>
                    <td>{st.stats.sound}</td>
                    <td>{st.power}/{st.maxPower}</td>
                    <td>{Math.round(st.salary * Math.pow(1.2, st.levelUps))}K</td>
                    <td>
                      {price && lv < 5 && (
                        <button className="w95-btn" disabled={game.research < price} onClick={() => actionLevelUp(st.id)} title={`${price} PR`}>
                          ⬆ Lv{lv + 1} ({price})
                        </button>
                      )}
                    </td>
                    <td>
                      {game.staff.length > 2 && (
                        <button className="w95-btn" onClick={() => actionFire(st.id)}>Уволить</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="w95-row">
            <span className="w95-hint">Смена профессии (нужны уровни на этом сотруднике):</span>
            <select className="w95-input" value={careerFor} onChange={(e) => setCareerFor(e.target.value)}>
              <option value="">— сотрудник —</option>
              {game.staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <select className="w95-input" onChange={(e) => { if (careerFor && e.target.value) actionChangeCareer(careerFor, e.target.value); e.target.value = ''; }}>
              <option value="">— новая профессия —</option>
              {['director', 'producer', 'hw', 'hacker'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {s && <span className="w95-hint">требования: {Object.entries(CONFIG.CAREER_PREREQ[s.activeCareer] ?? {}).map(([j, lv]) => `${CAREER_LABELS[j] ?? j} Lv${lv}`).join(' + ')}</span>}
          </div>

          <b>Поиск сотрудников</b>
          <div className="w95-field">
            {(Object.keys(CONFIG.HIRE_METHODS) as HireMethodId[]).map((m) => (
              <div key={m} className="w95-li" style={{ padding: '1px 4px' }}>
                <label className="w95-row">
                  <input
                    type="radio" checked={method === m} onChange={() => setMethod(m)}
                    disabled={game.officeLevel < CONFIG.HIRE_METHODS[m].office}
                  />
                  {METHOD_LABELS[m]}
                  {game.officeLevel < CONFIG.HIRE_METHODS[m].office && <span className="w95-hint">(нужен офис {CONFIG.HIRE_METHODS[m].office})</span>}
                </label>
              </div>
            ))}
          </div>
          {candidates.length > 0 && (
            <>
              <div className="w95-hint">Кандидаты ({cfg.pool.join(', ')}) — нажмите «Нанять» под нужным:</div>
              <table className="w95-table">
                <tbody>
                  {candidates.map((c) => c && (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{CAREER_LABELS[c.activeCareer] ?? c.activeCareer}</td>
                      <td>П{c.stats.program} С{c.stats.scenario} Г{c.stats.graphics} З{c.stats.sound}</td>
                      <td>взнос {Math.round(c.hireFee)}K</td>
                      <td>{Math.round(c.salary)}K/год</td>
                      <td>
                        <button
                          className="w95-btn"
                          disabled={officeFull || game.money < cfg.cost + c.hireFee}
                          onClick={() => actionHire(method, c.id)}
                          title={officeFull ? 'Офис заполнен — купите офис больше' : game.money < cfg.cost + c.hireFee ? `Нужно ${cfg.cost + Math.round(c.hireFee)}K` : `Нанять за ${cfg.cost + Math.round(c.hireFee)}K`}
                        >
                          Нанять
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="w95-hint">
                Поиск {cfg.cost}K; при найме спишется взнос. Кандидаты после найма/увольнения больше не появляются.
              </div>
            </>
          )}
          {candidates.length === 0 && <div className="w95-hint">Кандидатов по этому методу больше нет.</div>}
          <OfficeMove />
        </>
      )}

      {tab === 'training' && (
        <>
          <div className="w95-hint" style={{ marginBottom: 2 }}>Сотрудник на тренинг:</div>
          <div className="w95-staff-grid">
            {game.staff.map((st) => (
              <StaffCard
                key={st.id}
                st={st}
                selected={trainStaffId === st.id}
                disabled={st.power < 1}
                onClick={() => setTrainStaffId(st.id)}
              />
            ))}
          </div>
          <table className="w95-table">
            <thead>
              <tr><th>Тренинг</th><th>Цена</th><th>POWER</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th>Офис</th><th></th></tr>
            </thead>
            <tbody>
              {meta.trainings.map((t) => (
                <tr key={t.id}>
                  <td>{t.nameRu ?? t.name}</td>
                  <td>{Math.round((t.costWan ?? 0) / 10)}K</td>
                  <td>−{t.power ?? 0}</td>
                  <td>{t.program ?? '—'}</td>
                  <td>{t.scenario ?? '—'}</td>
                  <td>{t.graphics ?? '—'}</td>
                  <td>{t.sound ?? '—'}</td>
                  <td>{t.office}</td>
                  <td>
                    <button
                      className="w95-btn"
                      disabled={!trainStaffId || game.officeLevel < (t.office ?? 1)}
                      onClick={() => actionTrain(trainStaffId, t.id)}
                    >
                      Обучить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="w95-hint">Тренинги открывают новые типы игр (например, «чтение» → фэнтези).</div>
        </>
      )}

      {tab === 'salesman' && (
        <SalesmanPanel />
      )}
    </div>
  );
}

function OfficeMove() {
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
        <button className="w95-btn" disabled={!ready || game.money < 600} onClick={() => actionMoveOffice()}>
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
      <button className="w95-btn" disabled={!ready || game.money < 2500} onClick={() => actionMoveOffice()}>
        🏢 Переехать в офис 3 (2,500K)
      </button>
      <span className="w95-hint">
        {ready ? (game.money < 2500 ? 'не хватает на переезд — нужно ещё 2,500K' : 'можно переезжать!') : `пока нельзя: ${lacks.join(', ')}`}
      </span>
    </div>
  );
}

// Продавец: бустеры, Dead Bull, Career Manual
function SalesmanPanel() {
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
                <td><button className="w95-btn" disabled={price === undefined || game.money < (price ?? 0)} onClick={() => actionBuyBooster(b.id)}>Купить</button></td>
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
                {['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="w95-btn" disabled={!staffId} onClick={() => staffId && actionBuyCareerManual(staffId, manualTarget)}>Купить</button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ─── Архив ───
export function ArchiveApp() {
  const game = useGame();
  const totalUnits = game.history.reduce((a, h) => a + h.units, 0);
  const totalRev = game.history.reduce((a, h) => a + h.revenue, 0);
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Игр: <b>{game.history.length}</b></span>
        <span>Продано: <b>{Math.round(totalUnits)}K</b></span>
        <span>Доход: <b>{Math.round(totalRev)}K</b></span>
        <span>Рекорд: <b>{Math.max(0, ...game.history.map((h) => h.score))}/40</b></span>
      </div>
      <table className="w95-table">
        <thead>
          <tr><th>Год/нед</th><th>Игра</th><th>Жанр × тип</th><th>Платформа</th><th>Оценка</th><th>Продажи</th><th>Доход</th><th>Вклад</th></tr>
        </thead>
        <tbody>
          {[...game.history].reverse().map((h, i) => (
            <tr key={i}>
              <td>{Math.floor((h.releaseWeek - 1) / 52) + 1}/{h.releaseWeek}</td>
              <td>{h.name}</td>
              <td>{h.genreId} × {h.typeId}</td>
              <td>{h.consoleId}</td>
              <td><b>{h.score}</b>{h.score >= CONFIG.HALL_OF_FAME ? ' 🏆' : ''}</td>
              <td>{Math.round(h.units)}K</td>
              <td>{Math.round(h.revenue)}K</td>
              <td>{h.contrib ? Object.entries(h.contrib).map(([n, v]) => `${n} ${v}`).join(' · ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Железо ───
export function HardwareApp() {
  const game = useGame();
  const meta = useMeta();
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <table className="w95-table">
        <thead>
          <tr><th>Консоль</th><th>Компания</th><th>Доступна</th><th>База</th><th>Лицензия</th><th></th></tr>
        </thead>
        <tbody>
          {meta.consoles.map((c) => {
            const cs = game.consoles[c.id];
            if (!cs || cs.removedAtWeek !== null && cs.removedAtWeek <= game.week) return null;
            return (
              <tr key={c.id}>
                <td><b>{c.name}</b> <span className="w95-hint">×{c.costMult}</span></td>
                <td>{c.company}</td>
                <td>{(() => {
                  const avail = cs.availableAtWeek;
                  return avail !== null && avail > game.week ? `через ${Math.round((avail - game.week) / 7)} нед.` : 'да';
                })()}</td>
                <td>{cs.base}K</td>
                <td>{c.licenseCost === 0 ? 'бесплатно' : `${Math.round(c.licenseCost)}K`}</td>
                <td>
                  {cs.licensed
                    ? <span style={{ color: '#008000' }}>куплена</span>
                    : (
                      <button
                        className="w95-btn"
                        disabled={(cs.availableAtWeek ?? 0) > game.week || game.money < c.licenseCost}
                        onClick={() => actionBuyLicense(c.id)}
                      >
                        Купить
                      </button>
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-hint">Своя консоль — см. панель ниже.</div>
      <OwnConsolePanel />
    </div>
  );
}

// ─── Исследования ───
export function ResearchApp() {
  const game = useGame();
  const meta = useMeta();
  const leveledTypes = meta.types.filter((t) => (game.typeLevels[t.id] ?? 0) > 0);
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-row">🔬 Исследовательские данные: <b>{Math.round(game.research)}</b></div>
      <b>Уровни жанров</b>
      <table className="w95-table">
        <tbody>
          {meta.genres.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td>{'★'.repeat(game.genreLevels[g.id] ?? 0)}<span className="w95-hint">{(game.genreLevels[g.id] ?? 0)}/5</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {leveledTypes.length > 0 && (
        <>
          <b>Уровни типов</b>
          <div className="w95-list" style={{ maxHeight: 140 }}>
            {leveledTypes.map((t) => (
              <div key={t.id} className="w95-li">{t.name}: {'★'.repeat(game.typeLevels[t.id] ?? 0)}</div>
            ))}
          </div>
        </>
      )}
      <div className="w95-hint">Технологии и контракты — в разработке (M4).</div>
    </div>
  );
}

// ─── Журналы ───
export function MagazinesApp() {
  const game = useGame();
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Гран-при: <b>{game.awards.grand}</b></span>
        <span>Лучший дизайн: <b>{game.awards.design}</b></span>
        <span>Лучшая музыка: <b>{game.awards.music}</b></span>
        <span>Второе место: <b>{game.awards.runnerUp}</b></span>
      </div>
      <b>Последние релизы</b>
      <table className="w95-table">
        <thead>
          <tr><th>Игра</th><th>Оценка</th><th>Продажи</th></tr>
        </thead>
        <tbody>
          {[...game.history].reverse().slice(0, 15).map((h, i) => (
            <tr key={i}>
              <td>{h.name}</td>
              <td><b>{h.score}</b>/40</td>
              <td>{Math.round(h.units)}K</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="w95-hint">Чарты и ежемесячные рейтинги — в разработке.</div>
    </div>
  );
}

// ─── Маркетинг ───
export function MarketingApp() {
  const game = useGame();
  const meta = useMeta();
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-row">👥 Фанаты: <b>{Math.round(game.fans)}</b></div>
      <b>Реклама</b>
      <table className="w95-table">
        <thead>
          <tr><th>Способ</th><th>Цена</th><th>Офис</th><th>Фанаты (потолок)</th><th></th></tr>
        </thead>
        <tbody>
          {meta.ads.map((a) => {
            const cost = Math.round((a.costWan ?? 0) / 10);
            const cap = CONFIG.AD_FAN_CAPS[a.id] ?? 0;
            const got = game.adFansGained?.[a.id] ?? 0;
            const exhausted = cap > 0 && got >= cap;
            const noOffice = game.officeLevel < (a.office ?? 1);
            const poor = game.money < cost || cost === 0;
            const why = noOffice
              ? `Нужен офис ${a.office}`
              : exhausted
                ? 'Потолок фанатов достигнут — нужен другой способ'
                : poor
                  ? `Нужно ${cost}K`
                  : `+${Math.round((cap - got) * CONFIG.AD_FAN_GROWTH + CONFIG.AD_FAN_MIN)} фанатов за кампанию`;
            return (
              <tr key={a.id}>
                <td>{a.nameRu ?? a.name}</td>
                <td>{cost}K</td>
                <td>{a.office}</td>
                <td>{cap > 0 ? `${Math.round(got)}/${cap}` : '—'}</td>
                <td>
                  <button
                    className="w95-btn"
                    title={why}
                    disabled={noOffice || poor || cost === 0 || exhausted}
                    onClick={() => actionBuyAd(a.id)}
                  >
                    Купить
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-hint">
        Каждый способ даёт фанатов с убыванием до своего потолка — исчерпанный способ не работает,
        нужен другой. Реклама также поднимает известность текущей разработки (продажи при релизе).
        Gamedex — в разработке.
      </div>
    </div>
  );
}

// ─── Контракты ───
export function ContractsApp() {
  const game = useGame();
  const meta = useMeta();
  const [selId, setSelId] = useState<number | null>(null);
  const [team, setTeam] = useState<string[]>([]);

  const sel = meta.contracts.find((c) => c.id === selId);

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <b>Активные контракты</b>
      {game.contracts.filter((c) => !c.done).length === 0 && (
        <div className="w95-hint">Нет активных заказов.</div>
      )}
      {game.contracts.filter((c) => !c.done).map((c) => (
        <div key={c.id} className="w95-bevel-in" style={{ padding: 4, marginBottom: 4 }}>
          <b>{meta.contracts.find((m) => m.id === c.id)?.nameRu ?? c.name}</b> — дедлайн: день {c.deadline}
          <div className="w95-hint">
            П: {Math.round(c.progress.program)} · С: {Math.round(c.progress.scenario)} · Г: {Math.round(c.progress.graphics)} · З: {Math.round(c.progress.sound)}
          </div>
        </div>
      ))}

      <b>Доступные заказы</b>
      <table className="w95-table">
        <thead>
          <tr><th>Заказ</th><th>Срок</th><th>Требования</th><th>Награда</th><th></th></tr>
        </thead>
        <tbody>
          {meta.contracts.map((c) => (
            <tr key={c.id}>
              <td>{c.nameRu ?? c.name}</td>
              <td>{Math.round((c.weeks ?? 0) * 7)} дн.</td>
              <td className="w95-hint">
                П{c.reqProgram ?? '—'} С{c.reqScenario ?? '—'} Г{c.reqGraphics ?? '—'} З{c.reqSound ?? '—'}
              </td>
              <td>{c.rewardMin ?? 0}–{c.rewardMax ?? 0}K + {c.prMin ?? 0}–{c.prMax ?? 0} PR</td>
              <td>
                {selId === c.id ? (
                  <button className="w95-btn" onClick={() => setSelId(null)}>отмена</button>
                ) : (
                  <button className="w95-btn" onClick={() => setSelId(c.id)}>Взять</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel && (
      <div className="w95-bevel-in" style={{ padding: 6 }}>
      <b>{sel.nameRu ?? sel.name}</b> — назначьте 1–3 сотрудников:
          <div className="w95-row" style={{ flexWrap: 'wrap' }}>
            {game.staff.map((st) => (
              <label key={st.id} className="w95-row">
                <input
                  type="checkbox"
                  checked={team.includes(st.id)}
                  onChange={(e) => setTeam((t) => (e.target.checked ? [...t, st.id] : t.filter((x) => x !== st.id)))}
                />
                {st.name}
              </label>
            ))}
          </div>
          <button
            className="w95-btn"
            disabled={team.length === 0 || team.length > 3}
            onClick={() => { actionTakeContract(sel.id, team); setSelId(null); setTeam([]); }}
          >
            Начать работу
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Железо: своя консоль ───
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

// ─── Почта: письма фанатов (текст пишет LLM на сервере; заготовка — пока не доставлено) ───
export function MailApp() {
  const game = useGame();
  const wm = useWindows();
  const mail = game.mail ?? [];
  const mailOpen = wm.wins.some((w) => w.id === 'mail' && !w.minimized);
  const prevLen = useRef(0);
  // новое письмо при закрытом окне — подсветка кнопки в таскбаре (снимется при открытии)
  useEffect(() => {
    if (mail.length > prevLen.current && !mailOpen) wm.flash('mail');
    prevLen.current = mail.length;
  }, [mail.length, mailOpen, wm]);

  if (mail.length === 0) {
    return (
      <div className="w95-panel" style={{ height: '100%' }}>
        <div className="w95-hint">Писем пока нет. Выпускайте игры — фанаты пишут после релизов!</div>
      </div>
    );
  }
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      {[...mail].reverse().map((l) => {
        const emoji = l.sentiment === 'love' ? '💌' : l.sentiment === 'hate' ? '💔' : '✉️';
        const effect = l.fansDelta === 0
          ? ''
          : l.fansDelta > 0
            ? ` · фанаты +${l.fansDelta}`
            : ` · фанаты ${l.fansDelta}`;
        return (
          <div key={l.id} className="w95-mail-letter">
            <div className="w95-mail-head">
              {emoji} <b>{l.fanName}</b> — о «{l.gameName}» ({l.score}/40)
              <span className="w95-hint"> · {dateLabel(l.week)}{effect}</span>
            </div>
            <div className="w95-mail-text">{l.text || 'Письмо ещё пишется…'}</div>
          </div>
        );
      })}
    </div>
  );
}

export function HelpApp() {
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <b>Краткий мануал</b>
      <ul style={{ paddingLeft: 18, lineHeight: 1.5 }}>
        <li>Время идёт само; скорость — кнопки в правом нижнем углу.</li>
        <li>«Код» — новый проект: платформа → жанр → тип → режим → направление → роли.</li>
        <li>После 100% разработки ловите баги отладкой (≤10 — и выпускайте).</li>
        <li>Оценка 32/40 — Зал Славы; 36+ — кандидат на Гран-при (декабрь).</li>
        <li>«Найм» — новые сотрудники; зарплаты платятся в конце марта (1-й год бесплатно).</li>
        <li>«Железо» — лицензии консолей; новая консоль = дороже игра, но больше продажи.</li>
        <li>Чат живёт, пока работает локальный сервер (pnpm server).</li>
      </ul>
    </div>
  );
}
