import { memo } from "react";
import classnames from "classnames";

import * as Actions from "../../actionCreators";
import { Action, Thunk } from "../../types";
import OptionsContextMenu from "../OptionsContextMenu";
import ContextMenuTarget from "../ContextMenuTarget";
import { useActionCreator, useTypedSelector } from "../../hooks";
import * as Selectors from "../../selectors";

function setFocusDouble(): Action {
  return Actions.setFocus("double");
}

function mouseUp(): Thunk {
  return (dispatch) => {
    dispatch(Actions.toggleDoubleSizeMode());
    dispatch(Actions.unsetFocus());
  };
}

const ClutterBar = memo(() => {
  const handleMouseDown = useActionCreator(setFocusDouble);
  const handleMouseUp = useActionCreator(mouseUp);
  const doubled = useTypedSelector(Selectors.getDoubled);
  return (
    <div className="wa-clutter-bar">
      <ContextMenuTarget bottom renderMenu={() => <OptionsContextMenu />}>
        <div className="wa-button-o" />
      </ContextMenuTarget>
      <div className="wa-button-a" />
      <div className="wa-button-i" />
      <div
        title={"Toggle Doublesize Mode"}
        className={classnames('wa-button-d', { selected: doubled })}
        onPointerUp={handleMouseUp}
        onPointerDown={(e) => {
          e.preventDefault();
          handleMouseDown();
        }}
      />
      <div className="wa-button-v" />
    </div>
  );
});

export default ClutterBar;
