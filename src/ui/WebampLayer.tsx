// Winamp (webamp, исходники в libs/webamp) как настоящий React-компонент.
// Webamp монтируется ВНУТРЬ нашего хоста (renderInto, contained-режим):
// весь DOM winamp (окна, плейлист, эквалайзер, визуализации, меню) живёт
// внутри .w95-desktop как и остальные окна. Управление — обычные пропсы:
// zTop — слой поверх окон игры / в фоне; visible — свёрнут в трей.
import { useEffect, useRef, useState } from 'react';
import Webamp from 'webamp-internal';

interface Props {
  visible: boolean; // false = свёрнут в трей (display: none)
  zTop: boolean; // true = поверх окон игры, false = в фоне
  onHidden: () => void; // webamp закрыт/минимизирован пользователем → трей
}

export function WebampLayer({ visible, zTop, onHidden }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const waRef = useRef<Webamp | null>(null);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;
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
        try {
          const r = await fetch('/api/music');
          const d = (await r.json()) as { files?: string[] };
          const tracks = (d.files ?? []).map((f) => ({
            url: `/music/${encodeURIComponent(f)}`,
            title: f.replace(/\.mp3$/i, ''),
          }));
          if (tracks.length) wa.setTracksToPlay(tracks);
        } catch {
          /* нет музыки */
        }
      })
      .catch(() => {
        /* скин/рендер не удался */
      });
    const unsubClose = wa.onClose(() => {
      if (!disposed) {
        closedRef.current = true;
        onHiddenRef.current();
      }
    });
    const unsubMin = wa.onMinimize(() => {
      if (!disposed) {
        closedRef.current = true;
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
        /* noop */
      }
      waRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // webamp сам закрыл окна — при разворачивании вернуть их
    if (visible && closedRef.current) {
      closedRef.current = false;
      try {
        waRef.current?.reopen();
      } catch {
        /* noop */
      }
    }
    host.style.display = visible ? '' : 'none';
  }, [visible]);

  return (
    <div
      ref={hostRef}
      data-wa-host
      style={{ position: 'absolute', inset: 0, zIndex: zTop ? 8998 : 0 }}
    />
  );
}
