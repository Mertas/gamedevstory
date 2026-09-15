// «Настройки системы» — панель всех настроек игры в одном окне:
// звук, музыка (неактивная вкладка), эффекты экрана, обои, рабочий стол (сетка/сортировка).
// Дублирует то же, что живёт в трее и ПКМ-меню; хранение общее — правки видны сразу везде.
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOUND_LEVELS, soundLabel } from '../../../shared/sound';
import { readMusicHidden, writeMusicHidden, type MusicHidden } from '../../../shared/music';
import { resolveFx } from '../../../shared/dev-anim';
import { FX_ROWS, safeReducedMotion } from '../../fxPrefs';
import { setDeskSnap, setDeskSort, useDeskPrefs, type DeskSort } from '../../deskPrefs';
import { sfx, subscribeSound } from '../../sfx';
import { actionSetUi, useGameSelector } from '../../store';
import { WALLPAPERS } from '../../wallpapers';

const SORT_ROWS: Array<{ id: DeskSort; title: string }> = [
  { id: 'default', title: 'Сортировать по порядку' },
  { id: 'name', title: 'Сортировать по имени' },
  { id: 'kind', title: 'Сортировать по типу' },
];

export function SettingsApp() {
  const level = useSyncExternalStore(subscribeSound, () => sfx.soundLevel);
  const [musicHidden, setMusicHidden] = useState<MusicHidden>(readMusicHidden);
  const prefs = useDeskPrefs();
  const wallpaper = useGameSelector((g) => g.ui?.wallpaper ?? null);
  const gameUi = useGameSelector((g) => g.ui);
  const fxLevel = resolveFx(gameUi?.fx, safeReducedMotion());
  const setMusic = (v: MusicHidden) => {
    setMusicHidden(v);
    writeMusicHidden(v);
  };

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Section title="🔈 Звук" hint="пищалки интерфейса и клики">
        {SOUND_LEVELS.map((l) => (
          <div
            key={l}
            className={'w95-fx-row' + (level === l ? ' picked' : '')}
            onClick={() => sfx.setLevel(l)}
          >
            <span className="w95-fx-check">{level === l ? '✓' : ''}</span>
            <span>{soundLabel(l)}</span>
          </div>
        ))}
      </Section>

      <Section title="🎹 Музыка" hint="Бах в «Коде» и плеер Winamp">
        <div
          className={'w95-fx-row' + (musicHidden === 'on' ? ' picked' : '')}
          onClick={() => setMusic(musicHidden === 'on' ? 'off' : 'on')}
        >
          <span className="w95-fx-check">{musicHidden === 'on' ? '✓' : ''}</span>
          <span>
            <b>Выключать музыку в неактивной вкладке</b>
            <div className="w95-hint">
              с галкой — в фоне тишина (ноты гаснут); без галки — играет и в фоне спокойным ходом
            </div>
          </span>
        </div>
      </Section>

      <Section title="✨ Эффекты экрана" hint="анимация воды на экране «Код»">
        {FX_ROWS.map((row) => (
          <div
            key={row.id}
            className={'w95-fx-row' + (fxLevel === row.id ? ' picked' : '')}
            onClick={() => actionSetUi({ fx: row.id })}
          >
            <span className="w95-fx-check">{fxLevel === row.id ? '✓' : ''}</span>
            <span>
              <b>{row.title}</b>
              <div className="w95-hint">{row.hint}</div>
            </span>
          </div>
        ))}
      </Section>

      <Section title="🖼️ Обои" hint="клик — сразу применить">
        <div className="w95-bg-grid">
          <div
            className={'w95-bg-item' + (wallpaper === null ? ' picked' : '')}
            title="Обычный бирюзовый стол"
            onClick={() => actionSetUi({ wallpaper: null })}
          >
            <div className="w95-bg-plain">🎨</div>
            <span>Обычный (бирюза)</span>
          </div>
          {WALLPAPERS.map((w) => (
            <div
              key={w.id}
              className={'w95-bg-item' + (wallpaper === w.id ? ' picked' : '')}
              title={w.title}
              onClick={() => actionSetUi({ wallpaper: w.id })}
            >
              <img src={w.thumb} alt="" draggable={false} />
              <span>{w.title}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="🗔 Рабочий стол" hint="иконки">
        <div className={'w95-fx-row' + (prefs.snap ? ' picked' : '')} onClick={() => setDeskSnap(!prefs.snap)}>
          <span className="w95-fx-check">{prefs.snap ? '✓' : ''}</span>
          <span>Выровнять по сетке</span>
        </div>
        {SORT_ROWS.map((row) => (
          <div
            key={row.id}
            className={'w95-fx-row' + (prefs.sort === row.id ? ' picked' : '')}
            onClick={() => setDeskSort(row.id)}
          >
            <span className="w95-fx-check">{prefs.sort === row.id ? '✓' : ''}</span>
            <span>{row.title}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="w95-bevel-in" style={{ padding: 8 }}>
      <div className="w95-row" style={{ justifyContent: 'space-between' }}>
        <b>{title}</b>
        {hint && <span className="w95-hint">{hint}</span>}
      </div>
      <div className="w95-fx-list">{children}</div>
    </div>
  );
}
