// Типы для локального Winamp (исходники webamp в libs/webamp).
// tsc видит только эту декларацию; реальный код собирает Vite по алиасу
// 'webamp-internal' → libs/webamp/js/Webamp.ts (вне tsc-program, свой strict).
declare module 'webamp-internal' {
  export interface WebampTrack {
    url: string;
    title?: string;
  }
  export interface WebampOptions {
    initialSkin?: { url: string };
    availableSkins?: { url: string; name: string }[];
    enableHotkeys?: boolean;
    enableMediaHotkeys?: boolean;
    handleTrackDropEvent?: (e: DragEvent) => void;
    __butterchurn?: boolean;
    __butterchurnCanvas?: HTMLCanvasElement;
    __initialTracks?: WebampTrack[];
  }
  export default class Webamp {
    constructor(options?: WebampOptions);
    renderWhenReady(node?: HTMLElement | null): Promise<void>;
    renderInto(node: HTMLElement): Promise<void>;
    appendTracks(tracks: WebampTrack[]): void;
    setTracksToPlay(tracks: WebampTrack[]): void;
    setSkinFromUrl(url: string): Promise<void>;
    onClose(cb: () => void): () => void;
    onMinimize(cb: () => void): () => void;
    close(): void;
    reopen(): void;
    dispose(): void;
    isThereASkinInFlight(): boolean;
    /** воспроизведение (нужно настройке «выключать музыку в неактивной вкладке») */
    play(): void;
    pause(): void;
    stop(): void;
    getMediaStatus(): 'PLAYING' | 'STOPPED' | 'PAUSED';
  }
}
