// Theme + shared primitives pour CommandeIA "Cuisine vivante"

// Palettes — chacune raconte une histoire différente
const palettes = {
  'sable-foret': {
    name: 'Sable & Forêt',
    sable:'#F5EFE1', paper:'#FBF8F0', paperWarm:'#F0E8D4',
    forest:'#1F3A2E', forestDeep:'#142820',
    terracotta:'#D97548', miel:'#F4C43C', mielSoft:'#FBE9A8',
    ink:'#1F1A14', inkSoft:'#5B5147', inkMute:'#8A8175',
    line:'#E5DCC6', lineSoft:'#EFE7D2',
    good:'#3F7A4E', goodSoft:'#DAEAD3',
    warn:'#C8541C', warnSoft:'#F8DCC3',
    danger:'#B83824', dangerSoft:'#F5D1C7',
  },
  'encre-papier': {
    name: 'Encre & Papier',
    sable:'#F4F1EA', paper:'#FFFFFF', paperWarm:'#EBE6DA',
    forest:'#1A1815', forestDeep:'#000000',
    terracotta:'#8B6F4E', miel:'#D4B36A', mielSoft:'#EFE2C2',
    ink:'#1A1815', inkSoft:'#4A453D', inkMute:'#857E72',
    line:'#D9D2C2', lineSoft:'#E8E2D2',
    good:'#3D5C3D', goodSoft:'#D6DDC8',
    warn:'#8B5A2B', warnSoft:'#E8D5B7',
    danger:'#7A2E2E', dangerSoft:'#E5C8C8',
  },
  'crepuscule': {
    name: 'Crépuscule',
    sable:'#EEE7E8', paper:'#F8F2EF', paperWarm:'#E3D4D6',
    forest:'#3D2A4A', forestDeep:'#28182F',
    terracotta:'#E07856', miel:'#E8A04B', mielSoft:'#F7DBB5',
    ink:'#2A1E2E', inkSoft:'#5C4858', inkMute:'#8A7A85',
    line:'#DDD0D2', lineSoft:'#E8DEDF',
    good:'#4F7A6A', goodSoft:'#C9DCD2',
    warn:'#C76B3E', warnSoft:'#F2D2BB',
    danger:'#A84048', dangerSoft:'#EDC8CC',
  },
  'lagune': {
    name: 'Lagune',
    sable:'#EEF5F2', paper:'#F8FBF9', paperWarm:'#D6E8E0',
    forest:'#0E4B47', forestDeep:'#063532',
    terracotta:'#E36C5B', miel:'#F2C14E', mielSoft:'#F8E5B0',
    ink:'#0F2A28', inkSoft:'#3D5854', inkMute:'#7A8E89',
    line:'#CFE0D9', lineSoft:'#DCE9E3',
    good:'#2D8A6E', goodSoft:'#BFE3D2',
    warn:'#D17338', warnSoft:'#F6D9BD',
    danger:'#C04450', dangerSoft:'#F2C9CD',
  },
  'minuit': {
    name: 'Minuit cuisine',
    sable:'#1A1D1F', paper:'#252A2D', paperWarm:'#2F3438',
    forest:'#7BC47F', forestDeep:'#1F3A2E',
    terracotta:'#FF7A4D', miel:'#FFD24A', mielSoft:'#5C4D1F',
    ink:'#F2EEE3', inkSoft:'#B8B2A4', inkMute:'#7A7568',
    line:'#3A4045', lineSoft:'#2E3338',
    good:'#7BC47F', goodSoft:'#1F3A2E',
    warn:'#FF9A3C', warnSoft:'#4A2E18',
    danger:'#FF5C5C', dangerSoft:'#4A1F1F',
  },
};

// Trio de typo — change la voix entière du produit
const fontPairs = {
  manuscrit:   { name:'Manuscrit', ui:"'Inter', sans-serif",          serif:"'Instrument Serif', Georgia, serif", hand:"'Caveat', cursive",         mono:"'JetBrains Mono', monospace" },
  editorial:   { name:'Éditorial', ui:"'Inter', sans-serif",          serif:"'Fraunces', Georgia, serif",         hand:"'Fraunces', Georgia, serif", mono:"'JetBrains Mono', monospace" },
  brutaliste:  { name:'Brutaliste',ui:"'Space Grotesk', sans-serif",  serif:"'Space Grotesk', sans-serif",        hand:"'Space Mono', monospace",   mono:"'Space Mono', monospace" },
};

// Mutable references — screens read these by name at render time.
const theme = { ...palettes['sable-foret'] };
const fonts = { ...fontPairs.manuscrit };

const applyPalette = (key) => Object.assign(theme, palettes[key] || palettes['sable-foret']);
const applyFontPair = (key) => Object.assign(fonts, fontPairs[key] || fontPairs.manuscrit);

// Shared card chrome
const Card = ({ children, style = {}, padded = true }) => (
  <div style={{
    background: theme.paper,
    border: `1px solid ${theme.line}`,
    borderRadius: 14,
    boxShadow: '0 1px 0 rgba(31,26,20,0.02), 0 8px 24px -16px rgba(31,26,20,0.15)',
    padding: padded ? 18 : 0,
    ...style,
  }}>
    {children}
  </div>
);

const Pill = ({ children, bg = theme.paper, color = theme.ink, border = theme.line, style = {} }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: bg, color, border: `1px solid ${border}`,
    padding: '4px 10px', borderRadius: 999,
    fontFamily: fonts.ui, fontSize: 12, fontWeight: 500, lineHeight: 1,
    ...style,
  }}>{children}</span>
);

const Btn = ({ children, primary, ghost, style = {}, ...rest }) => {
  const base = {
    fontFamily: fonts.ui, fontSize: 13, fontWeight: 500,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    transition: 'transform .12s ease, background .12s',
  };
  const styles = primary
    ? { ...base, background: theme.forest, color: theme.paper, border: `1px solid ${theme.forestDeep}` }
    : ghost
      ? { ...base, background: 'transparent', color: theme.ink, border: '1px solid transparent' }
      : { ...base, background: theme.paper, color: theme.ink, border: `1px solid ${theme.line}` };
  return <button style={{ ...styles, ...style }} {...rest}>{children}</button>;
};

// Animated handwritten "highlight" — yellow marker swipe underneath
const Highlight = ({ children, color = theme.miel, style = {} }) => (
  <span style={{
    position: 'relative', display: 'inline-block',
    fontFamily: fonts.hand, fontWeight: 600,
    color: theme.ink,
    ...style,
  }}>
    <span style={{
      position: 'absolute', left: -2, right: -2, bottom: 1, top: '52%',
      background: color, opacity: 0.55, borderRadius: 3, zIndex: 0,
      transform: 'rotate(-0.6deg)',
    }} />
    <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
  </span>
);

// Section header (handwritten + post-it style)
const ArtboardHeader = ({ title, kicker, tags = [] }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
    <div>
      {kicker && (
        <div style={{ fontFamily: fonts.hand, fontSize: 18, color: theme.terracotta, lineHeight: 1, marginBottom: 4 }}>
          {kicker}
        </div>
      )}
      <h2 style={{ fontFamily: fonts.serif, fontSize: 34, lineHeight: 1.05, margin: 0, color: theme.ink, fontWeight: 400 }}>
        {title}
      </h2>
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {tags.map((t, i) => (
        <Pill key={i} bg={theme.mielSoft} border={theme.miel} color={theme.ink}
              style={{ fontFamily: fonts.hand, fontSize: 15 }}>{t}</Pill>
      ))}
    </div>
  </div>
);

Object.assign(window, { theme, fonts, palettes, fontPairs, applyPalette, applyFontPair, Card, Pill, Btn, Highlight, ArtboardHeader });
