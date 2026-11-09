import { preloadRoute } from "../services/routeModules.js";

export default function InternalLink({ href, navigate, onClick, onPointerEnter, onPointerDown, onFocus, ...props }) {
  function handleClick(event) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank" ||
      props.download
    ) {
      return;
    }

    event.preventDefault();
    navigate(href);
  }

  const warm = () => { if (props.target !== "_blank" && !props.download) preloadRoute(href); };
  return <a {...props} href={href} onClick={handleClick} onPointerEnter={(event) => { onPointerEnter?.(event); warm(); }} onPointerDown={(event) => { onPointerDown?.(event); warm(); }} onFocus={(event) => { onFocus?.(event); warm(); }} />;
}
