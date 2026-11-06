/** A player's initial on an ink circle: the one round thing in the system. Decorative: the name is always beside it. */
export default function Avatar({ username, size = 96 }: { username: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full bg-ink font-ui leading-none font-extrabold text-on-ink select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  );
}
