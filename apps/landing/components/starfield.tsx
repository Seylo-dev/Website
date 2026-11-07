const WIDTH = 1440;
const HEIGHT = 780;
const STAR_COUNT = 60;

/** Small deterministic PRNG, so the server and every build draw the same sky. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(7);
const stars = Array.from({ length: STAR_COUNT }, () => ({
  x: Math.round(random() * WIDTH),
  y: Math.round(random() * HEIGHT),
  r: 0.7 + Math.round(random() * 5) / 10,
  opacity: [0.18, 0.25, 0.32, 0.4, 0.5][Math.floor(random() * 5)],
}));

/** The faint dots behind the hero, fading out towards the product shot. Dark theme only: on the light ground they read as dust. */
export function Starfield() {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-x-0 top-0 h-[780px] w-full fill-star [mask-image:linear-gradient(180deg,#000_0%,#000_50%,transparent_100%)] light:hidden"
    >
      {stars.map((star, i) => (
        <circle key={i} cx={star.x} cy={star.y} r={star.r} fillOpacity={star.opacity} />
      ))}
    </svg>
  );
}
