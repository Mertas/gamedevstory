import { createPortal } from "react-dom";
import { useMemo, useLayoutEffect } from "react";

type Props = {
  children: string;
};

export default function Css({ children }: Props) {
  const style = useMemo(() => {
    const s = document.createElement("style");
    s.type = "text/css";
    return s;
  }, []);

  useLayoutEffect(() => {
    document.head.appendChild(style);
    return () => style.remove();
  }, [style]);

  return createPortal(children, style);
}
