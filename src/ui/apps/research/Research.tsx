// ─── Исследования ───
import { useGame, useMeta } from '../../store';

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
