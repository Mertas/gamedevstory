import ClickedDiv from "../ClickedDiv";
import { useTypedSelector, useActionCreator } from "../../hooks";
import * as Selectors from "../../selectors";
import * as Actions from "../../actionCreators";
import { WINDOWS } from "../../constants";
import WinampButton from "../WinampButton";

export default function EqTitleButtons() {
  const focusedWindow = useTypedSelector(Selectors.getFocusedWindow);

  const selected = focusedWindow === WINDOWS.EQUALIZER;
  const closeWindow = useActionCreator(Actions.closeWindow);
  const toggleEqualizerShadeMode = useActionCreator(
    Actions.toggleEqualizerShadeMode
  );
  return (
    <ClickedDiv className="wa-eq-buttons" key={selected ? "selected" : "unselected"}>
      <WinampButton className="wa-equalizer-shade" onClick={toggleEqualizerShadeMode} />
      <WinampButton
        className="wa-equalizer-close"
        onClick={() => closeWindow(WINDOWS.EQUALIZER)}
      />
    </ClickedDiv>
  );
}
