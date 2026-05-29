// Section C — extras : drill-in commande, débrief fin de service, états du KDS

// ── Drill-in : détail d'une commande ──────────────────────────────────────

const Allergen = ({ label, danger }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: danger ? theme.dangerSoft : theme.mielSoft,
    color: danger ? theme.danger : theme.warn,
    border: `1px solid ${danger ? theme.danger : theme.miel}`,
    letterSpacing: 0.3,
  }}>
    {danger && '⚠ '}{label}
  </span>
);

const PlatLigne = ({ name, mods, qty, done }) => (
  <div style={{
    padding: '11px 14px', borderRadius: 10,
    background: done ? theme.goodSoft + '60' : theme.paper,
    border: `1px solid ${done ? theme.good : theme.line}`,
    display: 'flex', gap: 12, alignItems: 'flex-start',
    opacity: done ? 0.8 : 1,
  }}>
    <span style={{
      width: 22, height: 22, borderRadius: '50%',
      background: done ? theme.good : 'transparent',
      border: `2px solid ${done ? theme.good : theme.line}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: theme.paper, fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
    }}>{done ? '✓' : ''}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span style={{ fontFamily: fonts.serif, fontSize: 17, color: theme.ink, textDecoration: done ? 'line-through' : 'none', textDecorationColor: theme.good }}>{name}</span>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: theme.inkMute }}>×{qty}</span>
      </div>
      {mods && mods.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {mods.map((m, i) => (
            <span key={i} style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4,
              background: m.warn ? theme.dangerSoft : theme.lineSoft,
              color: m.warn ? theme.danger : theme.inkSoft,
              fontFamily: fonts.ui, fontWeight: 500,
            }}>{m.warn && '⚠ '}{m.label}</span>
          ))}
        </div>
      )}
    </div>
  </div>
);

const ScreenCommandeDetail = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    {/* Header */}
    <div>
      <button style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: theme.inkSoft, fontFamily: fonts.ui, fontSize: 12, padding: 0,
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6,
      }}>← retour KDS</button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: fonts.serif, fontSize: 34, color: theme.ink, margin: 0, lineHeight: 1, fontWeight: 400 }}>Table 7</h1>
        <Pill bg={theme.dangerSoft} border={theme.danger} color={theme.danger} style={{ fontWeight: 700, letterSpacing: 0.4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: theme.danger, animation: 'kds-pulse-dot 1.4s ease-out infinite' }} />
          urgent · 0:42 retard
        </Pill>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: theme.inkMute }}>commande #1247 · 19:32</span>
      </div>
      <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, marginTop: 4 }}>
        4 couverts · Mme Durand (habituée — 3e visite)
      </div>
    </div>

    {/* Allergies + serveur */}
    <Card padded style={{ padding: 14, background: theme.paperWarm }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, letterSpacing: 0.8, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase' }}>Allergies / notes</div>
        <Allergen label="Sans gluten" danger />
        <Allergen label="Sans lactose" />
        <Allergen label="Bien cuit (table 2)" />
      </div>
    </Card>

    {/* Plats */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <PlatLigne name="Burger maison" qty={2} done mods={[{ label: 'pain sans gluten', warn: true }, { label: '+ fromage' }]} />
      <PlatLigne name="Risotto champignon" qty={1} done mods={[{ label: 'sans crème', warn: true }]} />
      <PlatLigne name="Frites maison" qty={3} mods={[{ label: 'huile dédiée', warn: true }]} />
      <PlatLigne name="Tiramisu" qty={2} mods={[{ label: 'à apporter en fin' }]} />
      <PlatLigne name="Café × 4" qty={1} mods={[{ label: '2 déca' }, { label: '1 noisette' }]} />
    </div>

    {/* Bottom : Chef Pixel suggestion */}
    <div style={{
      background: theme.forest, color: theme.paper, borderRadius: 12,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <ChefPixel size={42} mood="alert" />
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>
        2 desserts à venir · table 7 en retard de 42 sec. <b>Je propose un café offert</b> pour patienter ?
      </div>
      <button style={{
        background: theme.terracotta, color: theme.paper, border: 'none',
        padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>oui, envoyer</button>
    </div>

    {/* Footer total */}
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 4px', fontFamily: fonts.ui,
    }}>
      <span style={{ fontFamily: fonts.mono, fontSize: 12, color: theme.inkMute }}>4 plats · 3 boissons · 2 desserts</span>
      <span style={{ fontFamily: fonts.serif, fontSize: 24, color: theme.ink }}>87,40 €</span>
    </div>
  </div>
);

// ── Débrief de fin de service par Chef Pixel ─────────────────────────────

const StatBig = ({ label, value, sub, trend }) => (
  <div style={{ background: theme.paper, border: `1px solid ${theme.line}`, borderRadius: 12, padding: '14px 16px' }}>
    <div style={{ fontSize: 10.5, letterSpacing: 0.8, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
      <span style={{ fontFamily: fonts.serif, fontSize: 32, color: theme.ink, lineHeight: 1 }}>{value}</span>
      {trend && <span style={{ fontFamily: fonts.mono, fontSize: 11, color: trend.startsWith('+') ? theme.good : theme.danger, fontWeight: 700 }}>{trend}</span>}
    </div>
    {sub && <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 4 }}>{sub}</div>}
  </div>
);

const ScreenDebrief = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, lineHeight: 1 }}>vendredi · 23h12</div>
        <h1 style={{ fontFamily: fonts.serif, fontSize: 30, color: theme.ink, margin: '4px 0 0', fontWeight: 400 }}>Le service est fini</h1>
      </div>
      <Pill bg={theme.goodSoft} border={theme.good} color={theme.good} style={{ fontWeight: 700, letterSpacing: 0.5 }}>
        ✓ +12% vs moyenne
      </Pill>
    </div>

    {/* Chef Pixel résumé */}
    <Card padded style={{ background: theme.forest, color: theme.paper, border: 'none', padding: 18 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <ChefPixel size={56} mood="happy" pulsing />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: fonts.serif, fontSize: 20, lineHeight: 1.25 }}>
            Beau service Marie. 47 cmds envoyées, 3 retards mais bien rattrapés. <span style={{ color: theme.miel }}>Tiramisu sold-out</span> à 22h — pense à en faire +3 demain.
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={{ background: theme.terracotta, color: theme.paper, border: 'none', padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>voir le rapport</button>
            <button style={{ background: 'transparent', color: theme.paper, border: `1px solid ${theme.paper}33`, padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>partager équipe</button>
          </div>
        </div>
      </div>
    </Card>

    {/* Stats */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      <StatBig label="Commandes" value="47" trend="+12%" sub="vs ven. moy" />
      <StatBig label="CA du soir" value="1 240€" trend="+18%" sub="vs ven. moy" />
      <StatBig label="Temps moy." value="17′" trend="-2′" sub="vs ven. moy" />
    </div>

    {/* Anomalies + highlights */}
    <Card padded style={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme.lineSoft}` }}>
        {[
          { l: 'highlights', n: 4, on: true },
          { l: 'anomalies',  n: 2 },
          { l: 'à prévoir',  n: 3 },
        ].map((t, i) => (
          <span key={i} style={{
            flex: 1, padding: '11px 14px', fontSize: 12, fontWeight: 600,
            color: t.on ? theme.ink : theme.inkMute,
            borderBottom: t.on ? `2px solid ${theme.terracotta}` : '2px solid transparent',
            textAlign: 'center',
          }}>{t.l} <span style={{ opacity: 0.6 }}>({t.n})</span></span>
        ))}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden' }}>
        {[
          { ico: '★', c: theme.miel,       t: '100e commande franchie',     d: '21:14 · Mme Durand · café offert' },
          { ico: '↑', c: theme.good,       t: 'Pic à 20h45',                 d: '11 cmds en 6 min · bien tenu' },
          { ico: '💰', c: theme.terracotta, t: 'Burger maison · best-seller', d: '14 ventes · 22% du CA solides' },
          { ico: '✓', c: theme.good,       t: '0 plainte client',            d: '4 avis 5★ sur Google ce soir' },
        ].map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, background: h.c + '22',
              color: h.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>{h.ico}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 16, color: theme.ink, lineHeight: 1.1 }}>{h.t}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 2 }}>{h.d}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

// ── États du KDS : calme / rythmé / sous l'eau ────────────────────────────

const StateCard = ({ state, color, count, time, mood, message }) => (
  <div style={{
    background: theme.paper, border: `2px solid ${color}`, borderRadius: 14,
    padding: 18, display: 'flex', flexDirection: 'column', gap: 10, flex: 1,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ChefPixel size={48} mood={mood} pulsing={state !== 'calme'} />
      <div>
        <div style={{ fontSize: 10.5, letterSpacing: 0.8, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase' }}>{state === 'calme' ? '○' : state === 'rythmé' ? '◐' : '●'} État</div>
        <div style={{ fontFamily: fonts.serif, fontSize: 22, color, lineHeight: 1, textTransform: 'capitalize' }}>{state}</div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, background: theme.paperWarm, borderRadius: 10, padding: '8px 10px' }}>
        <div style={{ fontSize: 10, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>cmds/h</div>
        <div style={{ fontFamily: fonts.serif, fontSize: 22, color: theme.ink, lineHeight: 1, marginTop: 2 }}>{count}</div>
      </div>
      <div style={{ flex: 1, background: theme.paperWarm, borderRadius: 10, padding: '8px 10px' }}>
        <div style={{ fontSize: 10, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>tps moy</div>
        <div style={{ fontFamily: fonts.serif, fontSize: 22, color: theme.ink, lineHeight: 1, marginTop: 2 }}>{time}</div>
      </div>
    </div>

    <div style={{
      background: color + '14', border: `1px dashed ${color}`, borderRadius: 10,
      padding: '10px 12px', fontSize: 12, color: theme.ink, lineHeight: 1.4,
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ color, fontSize: 14 }}>"</span>
      <span>{message}</span>
    </div>

    {/* mini bar viz */}
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 32, marginTop: 'auto' }}>
      {Array.from({ length: 18 }).map((_, i) => {
        const h = state === 'calme' ? 0.2 + Math.sin(i * 0.6) * 0.15
               : state === 'rythmé' ? 0.4 + Math.sin(i * 0.9) * 0.3
               : 0.7 + Math.sin(i * 1.4) * 0.25;
        return <div key={i} style={{
          flex: 1, height: '100%', background: color,
          borderRadius: 1, transformOrigin: 'bottom', transform: `scaleY(${Math.max(0.1, Math.abs(h))})`,
          opacity: 0.75,
        }} />;
      })}
    </div>
  </div>
);

const ScreenEtats = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    <div>
      <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, lineHeight: 1 }}>la cuisine respire — 3 souffles</div>
      <h1 style={{ fontFamily: fonts.serif, fontSize: 30, color: theme.ink, margin: '4px 0 0', fontWeight: 400 }}>États du service</h1>
    </div>

    <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
      <StateCard
        state="calme"     color={theme.good}      count="4"  time="11′" mood="happy"
        message="On a le temps. Bon moment pour nettoyer la plonge ou préparer les fonds." />
      <StateCard
        state="rythmé"    color={theme.terracotta} count="18" time="17′" mood="thinking"
        message="Le rythme idéal. Tout sort en temps. Surveille juste la table 7 qui prend du retard." />
      <StateCard
        state="sous l'eau" color={theme.danger}    count="32" time="28′" mood="alert"
        message="Coup de bourre. Je viens de prévenir la salle de prévenir 5 min de plus. Tiens bon." />
    </div>

    <Card padded style={{ background: theme.paperWarm, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 22 }}>🔔</span>
      <div style={{ flex: 1, fontSize: 12.5, color: theme.ink, lineHeight: 1.4 }}>
        Chaque état déclenche son <b>jeu de sons</b> et son <b>rythme d'animations</b>. <span style={{ fontFamily: fonts.hand, fontSize: 15, color: theme.terracotta }}>l'app respire avec toi</span>
      </div>
    </Card>
  </div>
);

Object.assign(window, { ScreenCommandeDetail, ScreenDebrief, ScreenEtats });
