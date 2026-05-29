// Pulse du service + Notifs sonores + Avant/Après + Onboarding

const ScreenPulse = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, overflow: 'hidden',
    display: 'flex', flexDirection: 'column', gap: 14,
  }}>
    <style>{`
      @keyframes pulse-ring { 0% { transform: scale(.85); opacity: 1; } 100% { transform: scale(1.35); opacity: 0; } }
      @keyframes pulse-core { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      @keyframes bar-rise { 0% { transform: scaleY(.3); } 50% { transform: scaleY(1); } 100% { transform: scaleY(.3); } }
    `}</style>

    <div>
      <div style={{ fontFamily: fonts.hand, fontSize: 18, color: theme.terracotta, lineHeight: 1 }}>battement temps réel</div>
      <div style={{ fontFamily: fonts.serif, fontSize: 32, color: theme.ink, marginTop: 4 }}>Pulse du service</div>
    </div>

    {/* Big pulse */}
    <div style={{
      flex: 1, minHeight: 0,
      background: theme.paper, border: `1px solid ${theme.line}`,
      borderRadius: 14, padding: 22,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `2px solid ${theme.good}`,
            animation: `pulse-ring 2.4s ease-out infinite`,
            animationDelay: `${i * 0.8}s`,
          }} />
        ))}
        <div style={{
          width: 170, height: 170, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${theme.goodSoft}, ${theme.paper})`,
          border: `2px solid ${theme.good}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse-core 1.8s ease-in-out infinite',
          boxShadow: `0 8px 28px -8px ${theme.good}66`,
        }}>
          <div style={{ fontFamily: fonts.serif, fontSize: 40, color: theme.forest, lineHeight: 1 }}>Rythmé</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 13, color: theme.inkSoft, marginTop: 6 }}>18 cmd / h</div>
        </div>
      </div>

      {/* tiny equalizer */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', marginTop: 20, height: 28 }}>
        {[0.4, 0.7, 0.5, 0.9, 0.6, 0.85, 0.5, 0.7, 0.45].map((h, i) => (
          <div key={i} style={{
            width: 4, height: 28, background: theme.forest, borderRadius: 2,
            transformOrigin: 'bottom', transform: `scaleY(${h})`,
            animation: `bar-rise 1.${4 + i % 4}s ease-in-out infinite`, animationDelay: `${i * 0.08}s`,
          }} />
        ))}
      </div>

      <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, marginTop: 14, textAlign: 'center', maxWidth: 360 }}>
        calme · <span style={{ color: theme.good, fontWeight: 700 }}>rythmé</span> · sous l'eau — un coup d'œil suffit
      </div>
    </div>

    {/* Zones */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {[
        { name: 'Cuisine',  state: 'OK',        sub: '4 cooks',     bg: theme.goodSoft,   color: theme.good,    border: theme.good },
        { name: 'Salle',    state: '3 libres',  sub: '12 tables',   bg: theme.mielSoft,   color: theme.warn,    border: theme.miel },
        { name: 'Bar',      state: 'Saturé',    sub: '8 cmds wait', bg: theme.dangerSoft, color: theme.danger,  border: theme.danger },
      ].map(z => (
        <div key={z.name} style={{
          background: z.bg, border: `1px solid ${z.border}`,
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ fontFamily: fonts.ui, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: theme.inkSoft, fontWeight: 600 }}>{z.name}</div>
          <div style={{ fontFamily: fonts.serif, fontSize: 22, color: z.color, marginTop: 2 }}>{z.state}</div>
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 2 }}>{z.sub}</div>
        </div>
      ))}
    </div>
  </div>
);

const ScreenNotifs = () => {
  const rows = [
    { ico: '✦', label: 'Nouvelle commande',     bg: theme.paperWarm,   sound: 'ding doux',    pack: 'discret' },
    { ico: '◐', label: 'Commande > 15 min',      bg: theme.mielSoft,    sound: 'cloche',       pack: 'classique' },
    { ico: '🔔', label: 'Commande > 25 min',     bg: theme.dangerSoft,  sound: 'alerte',       pack: 'classique', danger: true },
    { ico: '✓', label: 'Prête à envoyer',        bg: theme.goodSoft,    sound: 'cloche claire', pack: 'discret' },
    { ico: '★', label: '100e commande du jour',  bg: theme.mielSoft,    sound: 'jingle',       pack: 'arcade' },
  ];
  return (
    <div style={{
      width: '100%', height: '100%', background: theme.sable,
      padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div>
        <div style={{ fontFamily: fonts.hand, fontSize: 18, color: theme.terracotta, lineHeight: 1 }}>3 packs · discret / classique / arcade</div>
        <div style={{ fontFamily: fonts.serif, fontSize: 32, color: theme.ink, marginTop: 4 }}>Notifs sonores</div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px',
            borderBottom: i < rows.length - 1 ? `1px solid ${theme.lineSoft}` : 'none',
            background: i === 2 ? theme.dangerSoft + '40' : 'transparent',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: r.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: r.danger ? theme.danger : theme.ink,
              flexShrink: 0,
            }}>{r.ico}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 18, color: theme.ink, lineHeight: 1.1 }}>{r.label}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 2 }}>pack · {r.pack}</div>
            </div>
            <button style={{
              fontFamily: fonts.ui, fontSize: 12, fontWeight: 600,
              padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
              background: theme.paper, color: theme.ink, border: `1px solid ${theme.line}`,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1 L9 5 L1 9 Z" fill={theme.forest} /></svg>
              {r.sound}
            </button>
          </div>
        ))}
      </Card>

      <div style={{ fontFamily: fonts.hand, fontSize: 16, color: theme.inkSoft, textAlign: 'center' }}>
        bien dosé il <Highlight>rythme</Highlight> le service · mal dosé il <Highlight color={theme.dangerSoft}>stresse</Highlight>
      </div>
    </div>
  );
};

const ScreenAvantApres = () => {
  const TicketOld = () => (
    <div style={{ background: '#fff', border: '1px solid #d8d8d8', borderRadius: 4, padding: '8px 10px', fontFamily: 'Arial, sans-serif', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, color: '#333' }}>Mme Durand</span>
        <span style={{ fontSize: 10, background: '#1a3a1a', color: '#9ec27a', padding: '2px 6px', borderRadius: 2 }}>NOUVELLE</span>
      </div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 3 }}>Burger + frites · sans gluten</div>
      <div style={{ color: '#999', fontSize: 9, marginTop: 2 }}>Table 7 · 19:32</div>
    </div>
  );
  const TicketNew = () => (
    <div style={{
      background: theme.paper, borderLeft: `4px solid ${theme.terracotta}`,
      border: `1px solid ${theme.line}`, borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: fonts.serif, fontSize: 22, color: theme.ink, lineHeight: 1 }}>Mme Durand</span>
        <Pill bg={theme.terracotta} color={theme.paper} border={theme.terracotta}
              style={{ fontWeight: 700, letterSpacing: 0.4, fontSize: 11 }}>NOUVELLE · 2 min</Pill>
      </div>
      <div style={{ color: theme.inkSoft, fontSize: 13, marginTop: 8 }}>Burger maison · frites · <i>sans gluten</i></div>
      <div style={{ color: theme.inkMute, fontFamily: fonts.mono, fontSize: 11, marginTop: 8, display: 'flex', gap: 10 }}>
        <span>T7</span><span>·</span><span>19:32</span><span>·</span><span>17€80</span>
      </div>
    </div>
  );
  return (
    <div style={{
      width: '100%', height: '100%', background: theme.sable,
      padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <div style={{ fontFamily: fonts.hand, fontSize: 18, color: theme.terracotta, lineHeight: 1 }}>même contenu, lecture à 2 mètres</div>
        <div style={{ fontFamily: fonts.serif, fontSize: 32, color: theme.ink, marginTop: 4 }}>
          Avant <span style={{ fontFamily: fonts.hand, color: theme.terracotta }}>→</span> Après
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start', flex: 1 }}>
        <div>
          <div style={{ fontFamily: fonts.ui, fontSize: 10.5, letterSpacing: 1.2, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Avant</div>
          <TicketOld />
          <ul style={{ marginTop: 14, padding: 0, listStyle: 'none', fontFamily: fonts.ui, fontSize: 12, color: theme.inkSoft, lineHeight: 1.7 }}>
            <li>· tout petit, dense</li>
            <li>· vert sombre <span style={{ fontFamily: fonts.mono }}>#1a3a1a</span> "SaaS 2018"</li>
            <li>· bord gris uniforme</li>
            <li>· pas de hiérarchie</li>
          </ul>
        </div>
        <div>
          <div style={{ fontFamily: fonts.ui, fontSize: 10.5, letterSpacing: 1.2, color: theme.terracotta, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Après</div>
          <TicketNew />
          <ul style={{ marginTop: 14, padding: 0, listStyle: 'none', fontFamily: fonts.ui, fontSize: 12, color: theme.inkSoft, lineHeight: 1.7 }}>
            <li>· typo serif douce sur les noms</li>
            <li>· bord <Highlight>terracotta</Highlight> à gauche = statut</li>
            <li>· +50% padding, +30% taille</li>
            <li>· timer parlant (2 min, pas 19:34)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const ScreenOnboarding = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 0, 0, 0, 0, 0].map((on, i) => (
          <div key={i} style={{ width: on ? 22 : 8, height: 8, borderRadius: 999, background: on ? theme.forest : theme.line, transition: 'all .3s' }} />
        ))}
      </div>
      <span style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute }}>Étape 1/6</span>
    </div>

    <Card style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', justifyContent: 'center', gap: 18, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 18, right: 18, fontFamily: fonts.hand, fontSize: 16, color: theme.terracotta }}>tu peux sauter ↗</div>

      <ChefPixel size={120} mood="happy" pulsing />

      <div style={{ fontFamily: fonts.hand, fontSize: 22, color: theme.terracotta, lineHeight: 1 }}>
        Salut Marie 👋
      </div>
      <h1 style={{ fontFamily: fonts.serif, fontSize: 36, lineHeight: 1.05, color: theme.ink, margin: 0, maxWidth: 380 }}>
        On va t'aider à démarrer en <Highlight>5 minutes</Highlight>
      </h1>
      <p style={{ fontFamily: fonts.ui, fontSize: 14, color: theme.inkSoft, lineHeight: 1.5, maxWidth: 320, margin: 0 }}>
        6 étapes faciles — tu peux les sauter et y revenir quand tu veux. Chef Pixel t'accompagne.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <Btn primary style={{ padding: '12px 22px', fontSize: 14 }}>C'est parti →</Btn>
        <Btn ghost style={{ padding: '12px 18px', fontSize: 14, color: theme.inkSoft }}>plus tard</Btn>
      </div>
    </Card>

    <div style={{
      background: theme.mielSoft, border: `1px dashed ${theme.miel}`, borderRadius: 10,
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>💡</span>
      <div style={{ fontFamily: fonts.ui, fontSize: 12.5, color: theme.ink, lineHeight: 1.4 }}>
        <b>Astuce :</b> commence par tes <i>best-sellers</i>. L'IA déduira le reste depuis tes photos.
      </div>
    </div>
  </div>
);

Object.assign(window, { ScreenPulse, ScreenNotifs, ScreenAvantApres, ScreenOnboarding });
