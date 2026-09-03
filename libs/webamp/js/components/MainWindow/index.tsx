import * as React from "react";
import classnames from "classnames";
import { WINDOWS, MEDIA_STATUS, LOAD_STYLE } from "../../constants";
import * as Actions from "../../actionCreators";

import DropTarget from "../DropTarget";
import MiniTime from "../MiniTime";

import ClickedDiv from "../ClickedDiv";
import ContextMenuTarget from "../ContextMenuTarget";
import Vis from "../Vis";
import ActionButtons from "./ActionButtons";
import MainBalance from "./MainBalance";
import Close from "./Close";
import ClutterBar from "./ClutterBar";
import MainContextMenu from "./MainContextMenu";
import Eject from "./Eject";
import EqToggleButton from "./EqToggleButton";
import PlaylistToggleButton from "./PlaylistToggleButton";
import Kbps from "./Kbps";
import Khz from "./Khz";
import Marquee from "./Marquee";
import MonoStereo from "./MonoStereo";
import Position from "./Position";
import Repeat from "./Repeat";
import Shade from "./Shade";
import Minimize from "./Minimize";
import Shuffle from "./Shuffle";
import Time from "./Time";
import MainVolume from "./MainVolume";
import * as Selectors from "../../selectors";

import { FilePicker } from "../../types";
import FocusTarget from "../FocusTarget";
import { useActionCreator, useTypedSelector } from "../../hooks";

interface Props {
  analyser: AnalyserNode;
  filePickers: FilePicker[];
}

function loadMediaAndPlay(e: React.DragEvent<HTMLDivElement>) {
  return Actions.loadMedia(e, LOAD_STYLE.PLAY);
}

const MainWindow = React.memo(({ analyser, filePickers }: Props) => {
  const mainShade = useTypedSelector(Selectors.getWindowShade)("main");
  const status = useTypedSelector(Selectors.getMediaStatus);
  const focused = useTypedSelector(Selectors.getFocusedWindow);
  const loading = useTypedSelector(Selectors.getLoading);
  const doubled = useTypedSelector(Selectors.getDoubled);
  const llama = useTypedSelector(Selectors.getLlamaMode);
  const working = useTypedSelector(Selectors.getWorking);

  const className = classnames({
    window: true,
    play: status === MEDIA_STATUS.PLAYING,
    stop: status === MEDIA_STATUS.STOPPED,
    pause: status === MEDIA_STATUS.PAUSED,
    selected: focused === WINDOWS.MAIN,
    shade: mainShade,
    draggable: true,
    loading,
    doubled,
    llama,
  });

  const toggleMainWindowShadeMode = useActionCreator(
    Actions.toggleMainWindowShadeMode
  );
  const scrollVolume = useActionCreator(Actions.scrollVolume);
  const loadMedia = useActionCreator(loadMediaAndPlay);

  return (
    <DropTarget
      windowId={WINDOWS.MAIN}
      className={classnames('wa-main-window', className)}
      handleDrop={loadMedia}
      onWheelActive={scrollVolume}
    >
      <FocusTarget windowId={WINDOWS.MAIN}>
        <div
          className="wa-title-bar selected draggable"
          onDoubleClick={toggleMainWindowShadeMode}
        >
          <ContextMenuTarget
            className="wa-option-context"
            bottom
            renderMenu={() => <MainContextMenu filePickers={filePickers} />}
          >
            <ClickedDiv className="wa-option" title="Winamp Menu" />
          </ContextMenuTarget>
          {mainShade && <MiniTime />}
          <Minimize />
          <Shade />
          <Close />
        </div>
        <div className="webamp-status">
          <ClutterBar />
          {!working && <div className="wa-play-pause" />}
          <div
            className={classnames('wa-work-indicator', { selected: working })}
          />
          <Time />
        </div>
        <Vis analyser={analyser} />
        <div className="media-info">
          <Marquee />
          <Kbps />
          <Khz />
          <MonoStereo />
        </div>
        <MainVolume />
        <MainBalance />
        <div className="windows">
          <EqToggleButton />
          <PlaylistToggleButton />
        </div>
        <Position />
        <ActionButtons />
        <Eject />
        <div className="shuffle-repeat">
          <Shuffle />
          <Repeat />
        </div>
        <a
          className="wa-about"
          target="_blank"
          href="https://webamp.org/about"
          title="About"
        />
      </FocusTarget>
    </DropTarget>
  );
});

export default MainWindow;
