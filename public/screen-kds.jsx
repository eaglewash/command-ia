// KDS flux vivant — kanban animé, cartes glissent de colonne en colonne.

const KDSColumn = ({ label, count, accent, children }) => (
  <div style={{
    background: theme.paper,
    border: `1px solid ${theme.line}`,
    borderRadius: 12,
    padding: '10px 10px 12px',
    display: 'flex', flexDirection: 'column', gap: 8,
    minWidth: 0,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 6px 8px', borderBottom: `1px dashed ${theme.line}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
        <span style={{ fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.2, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <span style={{ fontFamily: fonts.serif, fontSize: 18, color: theme.ink, lineHeight: 1 }}>{count}</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {children}
    </div>
  </div>
);

const Ticket = ({ table, time, items, status, urgent, leftAccent, slideIn, ready, served }) => {
  const accent = urgent ? theme.danger : status === 'pret' ? theme.good : status === 'envoye' ? theme.inkMute : theme.terracotta;
  const bg = served ? theme.lineSoft : theme.paper;
  return (
    <div style={{
      background: bg,
      borderRadius: 10,
      border: `1px solid ${urgent ? theme.danger : theme.line}`,
      borderLeft: leftAccent ? `4px solid ${accent}` : `1px solid ${theme.line}`,
      padding: '10px 12px',
      opacity: served ? 0.55 : 1,
      position: 'relative',
      animation: slideIn ? 'kds-slide .6s cubic-bezier(.2,.8,.2,1.05) both' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontFamily: fonts.serif, fontSize: 18, color: theme.ink, lineHeight: 1 }}>
          {table}
        </div>
        <div style={{ fontFamily: fonts.mono, fontSize: 11, color: urgent ? theme.danger : theme.inkMute, fontWeight: urgent ? 700 : 500 }}>
          {time}
        </div>
      </div>
      {items && (
        <div style={{ fontFamily: fonts.ui, fontSize: 12, color: theme.inkSoft, lineHeight: 1.4, marginBottom: ready || urgent ? 8 : 0 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
              <span style={{ color: theme.inkMute, fontVariantNumeric: 'tabular-nums' }}>×{it.qty}</span>
            </div>
          ))}
        </div>
      )}
      {urgent && (
        <Pill bg={theme.dangerSoft} border={theme.danger} color={theme.danger}
              style={{ fontSize: 10, padding: '3px 8px', fontWeight: 700, letterSpacing: 0.5 }}>
          <span style={{ animation: 'kds-flame 1.2s ease-in-out infinite' }}>🔥</span> {urgent}
        </Pill>
      )}
      {ready && (
        <Pill bg={theme.goodSoft} border={theme.good} color={theme.good}
              style={{ fontSize: 10, padding: '3px 8px', fontWeight: 700, letterSpacing: 0.5 }}>
          ✓ PRÊTE
        </Pill>
      )}
      {served && (
        <span style={{ fontFamily: fonts.hand, fontSize: 15, color: theme.good, position: 'absolute', right: 10, top: 6 }}>✓</span>
      )}
    </div>
  );
};

const ScreenKDS = () => (
  <div style={{
    width: '100%', height: '100%',
    background: theme.sable,
    padding: 22,
    fontFamily: fonts.ui,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex', flexDirection: 'column', gap: 14,
  }}>
    <style>{`
      @keyframes kds-slide { 0% { transform: translateX(-12px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
      @keyframes kds-flame { 0%,100% { transform: scale(1) rotate(-3deg); } 50% { transform: scale(1.12) rotate(3deg); } }
      @keyframes kds-pulse-dot { 0%,100% { box-shadow: 0 0 0 0 ${theme.danger}40 } 50% { box-shadow: 0 0 0 6px ${theme.danger}00 } }
    `}</style>

    {/* Top chrome */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'nowrap' }}>
          <span style={{ fontFamily: fonts.serif, fontSize: 28, lineHeight: 1, color: theme.ink, whiteSpace: 'nowrap' }}>Service du soir</span>
          <span style={{ fontFamily: fonts.mono, fontSize: 12, color: theme.inkMute, whiteSpace: 'nowrap' }}>· 47 cmds</span>
          <Pill bg={theme.dangerSoft} border={theme.danger} color={theme.danger}
                style={{ fontWeight: 700, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: theme.danger, animation: 'kds-pulse-dot 1.4s ease-out infinite' }} />
            3 urgentes
          </Pill>
        </div>
        <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, marginTop: 4 }}>
          Vendredi 19h41 — ça pulse, on tient le rythme.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
        <Pill bg={theme.paper} style={{ fontFamily: fonts.ui, whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: theme.good }} /> sons ON
        </Pill>
        <div style={{ display: 'flex', background: theme.paper, border: `1px solid ${theme.line}`, borderRadius: 999, padding: 3 }}>
          {['Service', 'KDS', 'Salle'].map((t, i) => (
            <span key={t} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: i === 1 ? theme.forest : 'transparent',
              color: i === 1 ? theme.paper : theme.inkSoft,
            }}>{t}</span>
          ))}
        </div>
      </div>
    </div>

    {/* Columns */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flex: 1, minHeight: 0 }}>
      <KDSColumn label="✦ Nouvelle" count={2} accent={theme.terracotta}>
        <Ticket table="T7" time="19:41" urgent="0:42" leftAccent slideIn
          items={[{ name: 'Burger maison', qty: 2 }, { name: 'Frites', qty: 2 }, { name: 'Coca', qty: 1 }]} />
        <Ticket table="T3" time="19:39" leftAccent
          items={[{ name: 'Salade chèvre', qty: 1 }, { name: 'Risotto', qty: 2 }]} />
      </KDSColumn>

      <KDSColumn label="◐ En prép" count={3} accent={theme.miel}>
        <Ticket table="T2" time="19:35" leftAccent
          items={[{ name: 'Magret de canard', qty: 2 }, { name: 'Gratin', qty: 1 }]} />
        <Ticket table="T8" time="19:33" leftAccent
          items={[{ name: 'Pizza margherita', qty: 1 }, { name: 'Tiramisu', qty: 2 }]} />
        <Ticket table="B5" time="19:30" leftAccent
          items={[{ name: 'Croque-monsieur', qty: 1 }]} />
      </KDSColumn>

      <KDSColumn label="→ À envoyer" count={2} accent={theme.good}>
        <Ticket table="T6" time="19:32" ready leftAccent slideIn status="pret"
          items={[{ name: 'Carbonara', qty: 2 }, { name: 'Tiramisu', qty: 2 }]} />
        <Ticket table="B2" time="19:28" ready leftAccent status="pret"
          items={[{ name: 'Mojito', qty: 2 }, { name: 'Spritz', qty: 1 }]} />
      </KDSColumn>

      <KDSColumn label="✓ Envoyées" count={3} accent={theme.inkMute}>
        <Ticket table="T1" time="19:22" served status="envoye"
          items={[{ name: 'Poke bowl', qty: 2 }]} />
        <Ticket table="T4" time="19:18" served status="envoye"
          items={[{ name: 'Tartare', qty: 1 }, { name: 'Frites', qty: 1 }]} />
        <Ticket table="B1" time="19:14" served status="envoye"
          items={[{ name: 'Café × 4', qty: 1 }]} />
      </KDSColumn>
    </div>

    {/* Bottom annotation arrow */}
    <div style={{
      position: 'absolute', right: 20, bottom: 14, pointerEvents: 'none',
      fontFamily: fonts.hand, color: theme.terracotta, fontSize: 16,
      maxWidth: 230, textAlign: 'right',
    }}>
      les cartes glissent avec un petit bounce
      <svg width="80" height="22" viewBox="0 0 80 22" style={{ display: 'block', marginLeft: 'auto', marginTop: 2 }}>
        <path d="M 6 16 Q 30 6 70 12" stroke={theme.terracotta} strokeWidth="1.5" fill="none" />
        <path d="M 65 8 L 72 12 L 66 16" stroke={theme.terracotta} strokeWidth="1.5" fill="none" />
      </svg>
    </div>
  </div>
);

Object.assign(window, { ScreenKDS });
