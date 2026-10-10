/**
 * The sky, continued: a quiet version of the hero sky behind the lower landing sections, so the page reads as one
 * scene instead of a sky on top of a flat page. Day: pale blue wash with soft clouds. Evening: a violet tint.
 * Night: navy with a sparse star tile. Crossfades with the theme like the hero sky does.
 */
const STARS = `url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27480%27%20height%3D%27480%27%3E%3Ccircle%20cx%3D%27155%27%20cy%3D%2772%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.29%27/%3E%3Ccircle%20cx%3D%27257%27%20cy%3D%27176%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.75%27/%3E%3Ccircle%20cx%3D%27103%27%20cy%3D%2741%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.29%27/%3E%3Ccircle%20cx%3D%2744%27%20cy%3D%27204%27%20r%3D%271.2%27%20fill%3D%27white%27%20opacity%3D%270.32%27/%3E%3Ccircle%20cx%3D%27107%27%20cy%3D%27301%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.57%27/%3E%3Ccircle%20cx%3D%27190%27%20cy%3D%27469%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.56%27/%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%27201%27%20r%3D%271.2%27%20fill%3D%27white%27%20opacity%3D%270.31%27/%3E%3Ccircle%20cx%3D%27148%27%20cy%3D%27392%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.31%27/%3E%3Ccircle%20cx%3D%27274%27%20cy%3D%2790%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.55%27/%3E%3Ccircle%20cx%3D%2730%27%20cy%3D%2729%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.52%27/%3E%3Ccircle%20cx%3D%27255%27%20cy%3D%27373%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.57%27/%3E%3Ccircle%20cx%3D%27218%27%20cy%3D%27144%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.63%27/%3E%3Ccircle%20cx%3D%27117%27%20cy%3D%27276%27%20r%3D%271.2%27%20fill%3D%27white%27%20opacity%3D%270.52%27/%3E%3Ccircle%20cx%3D%27165%27%20cy%3D%27215%27%20r%3D%271.2%27%20fill%3D%27white%27%20opacity%3D%270.79%27/%3E%3Ccircle%20cx%3D%2757%27%20cy%3D%27201%27%20r%3D%270.8%27%20fill%3D%27white%27%20opacity%3D%270.33%27/%3E%3Ccircle%20cx%3D%27235%27%20cy%3D%2719%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.67%27/%3E%3Ccircle%20cx%3D%27275%27%20cy%3D%27420%27%20r%3D%270.8%27%20fill%3D%27white%27%20opacity%3D%270.44%27/%3E%3Ccircle%20cx%3D%27168%27%20cy%3D%27238%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.29%27/%3E%3Ccircle%20cx%3D%2745%27%20cy%3D%27130%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.28%27/%3E%3Ccircle%20cx%3D%27337%27%20cy%3D%27311%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.41%27/%3E%3Ccircle%20cx%3D%27185%27%20cy%3D%27321%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.77%27/%3E%3Ccircle%20cx%3D%27171%27%20cy%3D%27293%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.28%27/%3E%3Ccircle%20cx%3D%27369%27%20cy%3D%2762%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.47%27/%3E%3Ccircle%20cx%3D%27440%27%20cy%3D%27238%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.50%27/%3E%3Ccircle%20cx%3D%27264%27%20cy%3D%27424%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.73%27/%3E%3Ccircle%20cx%3D%27134%27%20cy%3D%27199%27%20r%3D%270.8%27%20fill%3D%27white%27%20opacity%3D%270.63%27/%3E%3Ccircle%20cx%3D%27183%27%20cy%3D%27111%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.35%27/%3E%3Ccircle%20cx%3D%27111%27%20cy%3D%27112%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.71%27/%3E%3Ccircle%20cx%3D%2788%27%20cy%3D%27135%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.48%27/%3E%3Ccircle%20cx%3D%27177%27%20cy%3D%27272%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.63%27/%3E%3Ccircle%20cx%3D%27247%27%20cy%3D%27296%27%20r%3D%270.6%27%20fill%3D%27white%27%20opacity%3D%270.50%27/%3E%3Ccircle%20cx%3D%27418%27%20cy%3D%27457%27%20r%3D%271.2%27%20fill%3D%27white%27%20opacity%3D%270.47%27/%3E%3Ccircle%20cx%3D%27192%27%20cy%3D%2750%27%20r%3D%271.0%27%20fill%3D%27white%27%20opacity%3D%270.28%27/%3E%3Ccircle%20cx%3D%2732%27%20cy%3D%27100%27%20r%3D%270.7%27%20fill%3D%27white%27%20opacity%3D%270.31%27/%3E%3C/svg%3E")`;

const CLOUDS = [
  "top-[4%] -left-24 h-56 w-[34rem]",
  "top-[22%] -right-32 h-64 w-[38rem]",
  "top-[48%] -left-40 h-60 w-[36rem]",
  "top-[70%] -right-24 h-56 w-[32rem]",
];

export function AmbientSky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* day */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#bcd3ef_0%,#d6e5f6_18%,#e8f0fa_45%,#f1f5f9_80%,var(--color-bg)_100%)] transition-opacity duration-[1400ms] dark:opacity-0" />
      <div className="absolute inset-0 transition-opacity duration-[1400ms] dark:opacity-0">
        {CLOUDS.map((c) => (
          <div key={c} className={`absolute rounded-full bg-white/70 blur-3xl ${c}`} />
        ))}
      </div>
      {/* evening and night */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0c1834_0%,#0b1430_35%,#0b0f22_75%,var(--color-bg)_100%)] opacity-0 transition-opacity duration-[1400ms] dark:opacity-100" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgb(138_90_220/0.22),transparent_55%),radial-gradient(ellipse_at_85%_60%,rgb(214_110_150/0.12),transparent_55%)] opacity-0 transition-opacity duration-[1400ms] [mask-image:linear-gradient(180deg,transparent,black_28rem)] sky-evening:opacity-100" />
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-[1400ms] dark:opacity-70 [mask-image:linear-gradient(180deg,transparent,black_16rem,black_80%,transparent)]"
        style={{ backgroundImage: STARS, backgroundSize: "480px 480px" }}
      />
    </div>
  );
}
