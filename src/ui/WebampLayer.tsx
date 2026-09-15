// Winamp (webamp, исходники в libs/webamp) как настоящий React-компонент.
// Webamp монтируется ВНУТРЬ нашего хоста (renderInto, contained-режим):
// весь DOM winamp (окна, плейлист, эквалайзер, визуализации, меню) живёт
// внутри .w95-desktop как и остальные окна. Управление — обычные пропсы:
// zTop — слой поверх окон игры / в фоне; visible — свёрнут в трей.
import { useEffect, useRef } from 'react';
import Webamp from 'webamp-internal';
import { readMusicHidden } from '../shared/music';

interface Props {
  open: boolean; // Winamp запущен (× — закрыт)
  visible: boolean; // false = свёрнут в трей (display: none)
  zTop: boolean; // true = поверх окон игры, false = в фоне
  onHidden: () => void; // webamp минимизирован (—) → свёрнут в трей
  onExit: () => void; // webamp закрыт крестиком (×) → приложение закрыто
}

export function WebampLayer({ open, visible, zTop, onHidden, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const waRef = useRef<Webamp | null>(null);
  const readyRef = useRef(false); // webamp отрисован (renderInto завершён)
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const closedRef = useRef(false); // webamp сам закрыл свои окна (X) — при показе reopen

  // один раз: создать и отрисовать webamp внутри хоста
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const wa = new Webamp({ initialSkin: { url: '/skin/base.wsz' }, enableHotkeys: true });
    waRef.current = wa;
    wa.renderInto(host)
      .then(async () => {
        if (disposed) return;
        readyRef.current = true;
        try {
          const r = await fetch('/api/music');
          const d = (await r.json()) as {
            tracks?: Array<{ file: string; title: string; artist: string; album: string; duration: number | null }>;
          };
          // метаданные (артист/название/длительность) извлекает сервер и отдаёт готовыми —
          // webamp не скачивает файлы ради тегов, а сразу показывает «артист — название»
          const tracks = (d.tracks ?? []).map((t) => {
            const base = t.file.replace(/\.mp3$/i, '');
            return {
              url: `/music/${t.file.split('/').map((s) => encodeURIComponent(s)).join('/')}`,
              defaultName: base,
              duration: t.duration ?? undefined,
              metaData: {
                title: t.title || base,
                artist: t.artist || '',
                album: t.album || '',
              },
            };
          });
          if (tracks.length) wa.setTracksToPlay(tracks);
        } catch {
          /* нет музыки */
        }
      })
      .catch(() => {
        /* скин/рендер не удался */
      });
    const unsubClose = wa.onClose(() => {
      // крестик (×): полное закрытие Winamp (как у остальных окон игры)
      if (!disposed) {
        closedRef.current = true; // окна webamp закрыты — при следующем запуске reopen
        onExitRef.current();
      }
    });
    const unsubMin = wa.onMinimize(() => {
      // минус (—): свернуть в трей: музыка продолжает играть
      if (!disposed) {
        closedRef.current = true;
        onHiddenRef.current();
      }
    });
    // настройка «выключать музыку в неактивной вкладке»: в фоне — пауза, при возврате — продолжаем
    let waWasPlaying = false;
    const onVis = () => {
      const w = waRef.current;
      if (!w || disposed) return;
      try {
        if (document.visibilityState !== 'visible') {
          waWasPlaying = w.getMediaStatus() === 'PLAYING';
          if (waWasPlaying && readMusicHidden() === 'on') w.pause();
        } else if (waWasPlaying) {
          waWasPlaying = false;
          w.play();
        }
      } catch {
        /* API недоступен — играем как раньше */
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      unsubClose();
      unsubMin();
      try {
        wa.dispose();
      } catch {
        /* noop */
      }
      waRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // открыто и не свёрнуто: показать; если webamp сам закрывал окна (×) — вернуть их
    if (open && visible) {
      host.style.display = '';
      if (closedRef.current && readyRef.current) {
        closedRef.current = false;
        try {
          waRef.current?.reopen();
        } catch {
          /* noop */
        }
      }
    } else {
      host.style.display = 'none';
    }
  }, [open, visible]);

  return (
    <div
      ref={hostRef}
      data-wa-host
      style={{
        position: 'absolute',
        // рабочая область Winamp — над панелью задач (окна не заезжают под таскбар)
        top: 0, left: 0, right: 0, bottom: 30,
        zIndex: zTop ? 8998 : 0,
      }}
    />
  );
}
