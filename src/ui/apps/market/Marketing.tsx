// ─── Маркетинг ───
import { CONFIG } from '../../../core/config';
import { actionBuyAd, useGame, useMeta } from '../../store';

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
                    data-autopilot={`ad-${a.id}`}
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
