// Webamp — настоящий Winamp 2 в браузере (npm-пакет captbaritone/webamp).
// Монтируется в слой поверх рабочего стола: свои окна можно таскать,
// сворачивание/закрытие = прячем в трей (музыка продолжает играть).
import { useEffect, useRef } from 'react';
import Webamp from 'webamp';

interface Props {
  visible: boolean; // false = свёрнут в трей
  onHidden: () => void; // пользователь свернул/закрыл окна webamp → трей
}

export function WebampLayer({ visible, onHidden }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const waRef = useRef<Webamp | null>(null);
  const hiddenByUserRef = useRef(false);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  // монтирование один раз
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const wa = new Webamp({
      initialSkin: { url: '/skin/base.wsz' },
      enableHotkeys: false,
    });
    waRef.current = wa;
    wa.renderWhenReady(mount)
      .then(async () => {
        if (disposed) return;
        try {
          const r = await fetch('/api/music');
          const d = (await r.json()) as { files?: string[] };
          const tracks = (d.files ?? []).map((f) => ({
            url: `/music/${encodeURIComponent(f)}`,
            title: f.replace(/\.mp3$/i, ''),
          }));
          if (tracks.length) wa.setTracksToPlay(tracks);
        } catch {
          // музыка недоступна — молчим
        }
      })
      .catch(() => {});
    const unsubClose = wa.onClose(() => {
      if (!disposed) {
        hiddenByUserRef.current = true;
        onHiddenRef.current();
      }
    });
    const unsubMin = wa.onMinimize(() => {
      if (!disposed) {
        hiddenByUserRef.current = true;
        onHiddenRef.current();
      }
    });
    return () => {
      disposed = true;
      unsubClose();
      unsubMin();
      try {
        wa.dispose();
      } catch {
        // уже закрыт
      }
      waRef.current = null;
    };
  }, []);

  // показ/скрытие по состоянию из трея
  useEffect(() => {
    const mount = mountRef.current;
    const wa = waRef.current;
    if (!mount || !wa) return;
    if (visible) {
      mount.style.display = '';
      if (hiddenByUserRef.current) {
        hiddenByUserRef.current = false;
        try {
          wa.reopen();
        } catch {
          // ок
        }
      }
    } else {
      mount.style.display = 'none';
    }
  }, [visible]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        pointerEvents: 'none', background: 'transparent',
      }}
    />
  );
}
