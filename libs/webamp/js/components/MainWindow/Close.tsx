import { memo } from "react";
import ClickedDiv from "../ClickedDiv";
import { useActionCreator } from "../../hooks";

import * as Actions from "../../actionCreators";

const Close = memo(() => {
  const close = useActionCreator(Actions.close);
  return <ClickedDiv className="wa-close" onClick={close} title="Close" />;
});

export default Close;
