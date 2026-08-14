export default function InternalLink({ href, navigate, onClick, ...props }) {
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

  return <a {...props} href={href} onClick={handleClick} />;
}
