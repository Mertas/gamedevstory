import { memo } from "react";
import * as Utils from "../../utils";

import * as Actions from "../../actionCreators";
import * as Selectors from "../../selectors";
import { TIME_MODE } from "../../constants";
import { useActionCreator, useTypedSelector } from "../../hooks";

const Time = memo(() => {
  const toggleTimeMode = useActionCreator(Actions.toggleTimeMode);
  const timeElapsed = useTypedSelector(Selectors.getTimeElapsed);
  const duration = useTypedSelector(Selectors.getDuration) || 0;
  const timeMode = useTypedSelector(Selectors.getTimeMode);
  const seconds =
    timeMode === TIME_MODE.ELAPSED ? timeElapsed : duration - timeElapsed;

  const timeObj = Utils.getTimeObj(seconds);
  return (
    <div className="wa-time countdown" onClick={toggleTimeMode}>
      {timeMode === TIME_MODE.REMAINING && <div className="wa-minus-sign" />}
      <div
        className={`wa-minute-first-digit digit digit-${timeObj.minutesFirstDigit}`}
      />
      <div
        className={`wa-minute-second-digit digit digit-${timeObj.minutesSecondDigit}`}
      />
      <div
        className={`wa-second-first-digit digit digit-${timeObj.secondsFirstDigit}`}
      />
      <div
        className={`wa-second-second-digit digit digit-${timeObj.secondsSecondDigit}`}
      />
    </div>
  );
});

export default Time;
