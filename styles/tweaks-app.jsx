/* PlagLens style-guide — Tweaks (accent + UI font) */
const PL_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#4F46E5", "#4338CA", "#3730A3"],
  "font": "Onest"
}/*EDITMODE-END*/;

// load alternative UI fonts once (Onest already loaded in styles.css)
(function () {
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(l);
})();

function PLTweaks() {
  const [t, setTweak] = useTweaks(PL_DEFAULTS);

  React.useEffect(() => {
    const r = document.documentElement;
    const a = t.accent || PL_DEFAULTS.accent;
    r.style.setProperty('--accent', a[0]);
    r.style.setProperty('--accent-hover', a[1] || a[0]);
    r.style.setProperty('--accent-press', a[2] || a[1] || a[0]);
  }, [t.accent]);

  React.useEffect(() => {
    const r = document.documentElement;
    const stack = "'" + (t.font || 'Onest') + "', system-ui, -apple-system, sans-serif";
    r.style.setProperty('--font-ui', stack);
  }, [t.font]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Акцент" />
      <TweakColor
        label="Цвет действия"
        value={t.accent}
        options={[
          ["#4F46E5", "#4338CA", "#3730A3"],
          ["#2563EB", "#1D4ED8", "#1E40AF"],
          ["#059669", "#047857", "#065F46"],
          ["#7C3AED", "#6D28D9", "#5B21B6"],
          ["#0F172A", "#1E293B", "#334155"]
        ]}
        onChange={(v) => setTweak('accent', v)}
      />
      <TweakSection label="Шрифт интерфейса" />
      <TweakRadio
        label="Гротеск"
        value={t.font}
        options={["Onest", "Golos Text", "Manrope"]}
        onChange={(v) => setTweak('font', v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<PLTweaks />);
