// ─── Релиз: выпуск игры из статуса разработки (UI-08: вынесено из CodeApp.tsx).
// Итоги релиза (оценка/продажи) приходят попапом с сервера, здесь — кнопка и гейт по багам.
import { actionRelease, useGame } from '../../store';

export function ReleasePanel() {
  const game = useGame();
  const g = game.activeGame;
  if (!g || g.phase !== 'debug') return null;
  return (
    <div className="w95-row" style={{ gap: 8, marginTop: 4 }}>
      <button
        className="w95-btn"
        onClick={() => actionRelease()}
        disabled={g.bugs > 10}
        title={g.bugs > 10 ? 'Сначала вычисти баги (≤10)' : 'Выпустить игру'}
        data-autopilot="release"
      >
        🚀 Выпустить игру {g.bugs > 0 ? `(багов: ${Math.round(g.bugs)})` : ''}
      </button>
      {g.bugs > 10 && <span className="w95-hint">Слишком много багов — рецензенты разгромят</span>}
    </div>
  );
}
