import * as React from "react";
import * as Actions from "../actionCreators";
import * as Selectors from "../selectors";
import { useTypedSelector, useActionCreator } from "../hooks";

interface Props {
  style?: React.CSSProperties;
  className?: string;
}

export default function Volume({ style, className }: Props) {
  const volume = useTypedSelector(Selectors.getVolume);
  const setFocus = useActionCreator(Actions.setFocus);
  const unsetFocus = useActionCreator(Actions.unsetFocus);
  const setVolume = useActionCreator(Actions.setVolume);

  return (
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={volume}
      style={{ ...style, touchAction: "none" }}
      className={className}
      onChange={(e) => setVolume(Number(e.target.value))}
      onPointerDown={() => setFocus("volume")}
      onPointerUp={unsetFocus}
      title="Volume Bar"
    />
  );
}
