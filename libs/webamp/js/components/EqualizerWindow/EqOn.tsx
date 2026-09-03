import classnames from "classnames";

import * as Actions from "../../actionCreators";
import * as Selectors from "../../selectors";
import { useActionCreator, useTypedSelector } from "../../hooks";
import WinampButton from "../WinampButton";

const EqOn = () => {
  const toggleEq = useActionCreator(Actions.toggleEq);
  const on = useTypedSelector(Selectors.getEqualizerEnabled);
  return (
    <WinampButton
      className={classnames('wa-on', { selected: on })}
      onClick={toggleEq}
    />
  );
};

export default EqOn;
