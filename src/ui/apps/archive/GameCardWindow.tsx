// M8: карточка игры — содержимое ОТДЕЛЬНОГО окна рабочего стола (открывается из «Архива»).
// Раньше была попапом поверх стола; теперь это полноценное окно (двигается, сворачивается,
// живёт в таскбаре, раскладка сохраняется в сейве вместе с остальными окнами).
import { useMemo } from 'react';
import { CONFIG } from '../../../core/config';
import { dateLabel } from '../../../shared/meta';
import { useGame, useMeta } from '../../store';
import { pressVerdict } from '../../../shared/rules';
import { fmtK } from '../../../shared/nums';
import { fmtCopies, recordUnits } from '../../../shared/sales-stats';
import { CRITICS } from '../../../core/data/critics';
import { SalesChart } from '../../SalesWidget';
import { rebuildSalesCurve } from '../../../shared/archive';

/** id окна карточки: 'card:<имя>#<неделя релиза>' (по нему же восстанавливаем запись). */
export const CARD_WIN_PREFIX = 'card:';

export function cardWinId(h: { name: string; releaseWeek: number }): string {
  return `${CARD_WIN_PREFIX}${h.name}#${h.releaseWeek}`;
}

export function cardWinTitle(name: string): string {
  return `🎮 ${name}`;
}

export function GameCardWindow({ winId }: { winId: string }) {
  const game = useGame();
  const meta = useMeta();
  const key = winId.startsWith(CARD_WIN_PREFIX) ? winId.slice(CARD_WIN_PREFIX.length) : winId;
  const h = game.history.find((x) => `${x.name}#${x.releaseWeek}` === key) ?? null;

  const consoleMult = meta.consoles.find((c) => c.id === h?.consoleId)?.costMult ?? 1;
  const curve = useMemo(() => (h ? rebuildSalesCurve(h, consoleMult) : []), [h, consoleMult]);

  if (!h) return <div className="w95-hint" style={{ padding: 10 }}>Игра не найдена — архив мог измениться.</div>;

  const ri = Math.round; // в деталях — только целые числа
  const scaleW1 = curve.slice(0, 7).reduce((a, d) => a + (d.unitsF ?? d.units), 0);
  const planRevenue = curve.reduce((a, d) => a + d.revenue, 0);
  const genreName = meta.genres.find((g) => g.id === h.genreId)?.ru ?? h.genreId;
  const typeName = meta.types.find((t) => t.id === h.typeId)?.nameRu ?? h.typeId;
  const consoleName = meta.consoles.find((c) => c.id === h.consoleId)?.name ?? h.consoleId;
  const factUnits = h.paidUnits ?? h.units;
  const factRev = h.paidRevenue ?? h.revenue;
  const criticRows = h.judgeScores ?? [];
  const texts = h.reviewMessages ?? [];
  const rank = 1 + game.history.filter((x) => recordUnits(x) > recordUnits(h)).length;

  return (
    <div style={{ overflowY: 'auto', height: '100%', paddingBottom: 8 }}>
      <div className="arc-sec" style={{ paddingTop: 6 }}>
        <span className="w95-hint">{genreName} × {typeName} · {consoleName} · {dateLabel(h.releaseWeek)} (год {h.year})</span>
      </div>

      <div className="arc-sec" style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="arc-score">{h.score}/100</span>
        <span>{pressVerdict(h.score)}</span>
        {h.score >= CONFIG.HALL_OF_FAME && <b>🏆</b>}
      </div>

      <div className="arc-sec">
        <b>📜 Описание</b>
        <div>{h.plot || <span className="w95-hint">описание не сохранилось (архив до обновления)</span>}</div>
      </div>

      <div className="arc-sec">
        <b>📈 Продажи</b>
        <div className="arc-chart">
          <SalesChart sales={curve} scale={scaleW1} planRevenue={planRevenue} money={factRev} />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Копии: <b>{fmtCopies(factUnits)}</b>{h.paidUnits !== undefined && <> <span className="w95-hint">(план {fmtK(h.units)})</span></>}</span>
          <span>Доход: <b>{fmtK(factRev)}</b></span>
          <span>Место в студии: <b>#{rank}</b> из {game.history.length}</span>
        </div>
      </div>

      <div className="arc-sec">
        <b>📰 Пресса</b>
        {criticRows.length > 0 ? (
          criticRows.map((s, i) => (
            <div className="arc-crit" key={i}>
              <div className="mag">{CRITICS[i]?.magazine ?? 'Пресса'} · <b>{s}/10</b></div>
              <div><b>{CRITICS[i]?.name ?? 'Критик'}:</b> {texts[i] || <span className="w95-hint">текст не сохранился</span>}</div>
            </div>
          ))
        ) : (
          <div className="w95-hint">пресса не сохранилась (архив до обновления)</div>
        )}
      </div>

      <div className="arc-sec">
        <b>🧑‍🤝‍🧑 Вклад команды</b>
        <div>{h.contrib && Object.keys(h.contrib).length > 0
          ? Object.entries(h.contrib).map(([n, v]) => `${n} ${v}`).join(' · ')
          : <span className="w95-hint">—</span>}</div>
      </div>

      <div className="arc-sec">
        <b>🧾 Детали</b>
        <div className="w95-hint">
          Баги: {ri(h.bugsTotal ?? h.bugs)} · Атрибуты: веселье {ri(h.attrs.fun)}, креатив {ri(h.attrs.creativity)}, графика {ri(h.attrs.graphics)}, звук {ri(h.attrs.sound)}
          {h.awards && h.awards.length > 0 && <> · Награды: <b>{h.awards.join(', ')}</b> 🎖</>}
        </div>
      </div>

      <div className="arc-sec">
        <b>🗣 Как решали делать эту игру</b>
        {h.decisionChat && h.decisionChat.length > 0 ? (
          <div className="arc-chat">
            {h.decisionChat.map((m, i) => (
              <div className="arc-bubble" key={i}>
                <span className="who">{m.author}</span> <span className="w95-hint">{dateLabel(m.week)}</span>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="w95-hint">обсуждение не сохранилось — появится у игр, начатых после обновления</div>
        )}
      </div>
    </div>
  );
}
