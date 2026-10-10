/** A trailing "→" that slides forward while its link (which needs the `group` class) is hovered. */
export function Arrow() {
  return (
    <span aria-hidden className="inline-block transition-transform duration-200 ease-out-soft group-hover:translate-x-1">
      →
    </span>
  );
}
