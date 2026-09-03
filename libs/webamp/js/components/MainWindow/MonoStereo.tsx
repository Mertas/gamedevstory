import { memo } from "react";
import classnames from "classnames";
import * as Selectors from "../../selectors";
import { useTypedSelector } from "../../hooks";

const MonoStereo = memo(() => {
  const channels = useTypedSelector(Selectors.getChannels);
  return (
    <div className="mono-stereo">
      <div className={classnames('wa-stereo', { selected: channels === 2 })} />
      <div className={classnames('wa-mono', { selected: channels === 1 })} />
    </div>
  );
});

export default MonoStereo;
