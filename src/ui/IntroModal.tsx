// аудит-51 P1-11: онбординг новой партии — короткое приветствие, и «Код» уже открыт за ним.
// Показывается только у партий с introShown === false (только что созданные); у старых сейвов поля нет — тихо.
import { useEffect } from 'react';
import { actionIntroDone, useSnapshot } from './store';
import { useWindows } from './wm';

export function IntroModal() {
  const snap = useSnapshot();
  const wm = useWindows();
  const fresh = snap.game?.introShown === false;
  // первый рабочий день: главное окно сразу на экране — игроку остаётся выбрать первую игру
  useEffect(() => {
    if (fresh) wm.open('code');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);
  if (!fresh) return null;
  return (
    <div className="w95-modal">
      <div className="w95-modal-box" style={{ width: 'min(520px, 92vw)' }}>
        <b style={{ marginBottom: 6 }}>🎬 Студия открыта!</b>
        <div style={{ lineHeight: 1.45 }}>
          Сегодня у вашей студии первый рабочий день. Всё начинается в окне «Код»: выберите платформу,
          жанр и тип игры — и нажмите «Начать разработку». Первая игра принесёт первые деньги и первых
          фанатов, а полная история студии всегда лежит в «Журнале».
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="w95-btn" style={{ minWidth: 130 }} onClick={() => actionIntroDone()}>
            За работу!
          </button>
        </div>
      </div>
    </div>
  );
}
