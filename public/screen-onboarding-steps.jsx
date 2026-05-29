// Onboarding enrichi — étapes 2 à 6 + tour guidé. Chef Pixel partout.

const Steps = ({ active }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5, 6].map(i => {
        const done = i < active, on = i === active;
        return (
          <div key={i} style={{
            width: on ? 22 : 8, height: 8, borderRadius: 999,
            background: done ? theme.good : on ? theme.forest : theme.line,
            transition: 'all .3s',
          }} />
        );
      })}
    </div>
    <span style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute }}>Étape {active}/6</span>
  </div>
);

const Astuce = ({ children }) => (
  <div style={{
    background: theme.mielSoft, border: `1px dashed ${theme.miel}`, borderRadius: 10,
    padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10,
  }}>
    <div style={{ marginTop: 1, flexShrink: 0 }}><ChefPixel size={28} mood="happy" /></div>
    <div style={{ fontFamily: fonts.ui, fontSize: 12.5, color: theme.ink, lineHeight: 1.4 }}>
      {children}
    </div>
  </div>
);

const StepFrame = ({ step, kicker, title, children, footer, astuce, primary='Continuer →' }) => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    <Steps active={step} />
    <Card style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
      <div>
        {kicker && <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, lineHeight: 1 }}>{kicker}</div>}
        <h2 style={{ fontFamily: fonts.serif, fontSize: 28, lineHeight: 1.1, color: theme.ink, margin: '4px 0 0', fontWeight: 400 }}>{title}</h2>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      {footer}
    </Card>
    {astuce && <Astuce>{astuce}</Astuce>}
  </div>
);

// ── Étape 2 — Ton resto en bref ───────────────────────────────────────────

const ScreenOnboard2 = () => (
  <StepFrame
    step={2}
    kicker="présente-toi en 3 questions"
    title="Ton resto, en bref"
    astuce={<><b>Bon à savoir :</b> tu pourras tout modifier plus tard. On a juste besoin d'amorcer.</>}
    footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn ghost style={{ color: theme.inkSoft }}>← retour</Btn>
        <Btn primary>Continuer →</Btn>
      </div>
    }>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Nom du resto" value="Le Petit Lagon" />
      <Field label="Type de cuisine">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { l: 'Bistrot', on: true },
            { l: 'Brasserie' }, { l: 'Pizzeria' }, { l: 'Asiatique' },
            { l: 'Burger' }, { l: 'Gastro' }, { l: 'Café' }, { l: '+ autre' },
          ].map((c, i) => (
            <span key={i} style={{
              padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              background: c.on ? theme.forest : theme.paper,
              color: c.on ? theme.paper : theme.ink,
              border: `1px solid ${c.on ? theme.forest : theme.line}`,
            }}>{c.l}</span>
          ))}
        </div>
      </Field>
      <Field label="Capacité">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <input readOnly value="42" style={{
            width: 70, padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${theme.line}`, fontFamily: fonts.serif, fontSize: 22,
            background: theme.paper, color: theme.ink, textAlign: 'center',
          }} />
          <span style={{ fontFamily: fonts.ui, fontSize: 13, color: theme.inkSoft }}>couverts</span>
          <span style={{ fontFamily: fonts.hand, fontSize: 15, color: theme.terracotta, marginLeft: 'auto' }}>← approximatif, on s'en fiche</span>
        </div>
      </Field>
      <Field label="Logo (optionnel)">
        <div style={{
          border: `2px dashed ${theme.line}`, borderRadius: 12, padding: '20px',
          textAlign: 'center', color: theme.inkMute, fontSize: 12.5,
          background: theme.paperWarm,
        }}>
          glisse ton logo ici · ou <u>parcoure</u>
        </div>
      </Field>
    </div>
  </StepFrame>
);

const Field = ({ label, value, children }) => (
  <div>
    <div style={{ fontFamily: fonts.ui, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMute, marginBottom: 6 }}>{label}</div>
    {children || (
      <input readOnly value={value} style={{
        width: '100%', padding: '10px 14px', borderRadius: 10,
        border: `1px solid ${theme.line}`, fontFamily: fonts.serif, fontSize: 18,
        background: theme.paper, color: theme.ink,
      }} />
    )}
  </div>
);

// ── Étape 3 — Tes 5 plats stars ──────────────────────────────────────────

const PlatRow = ({ name, price, status }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 10,
    background: theme.paper, border: `1px solid ${theme.line}`,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: `repeating-linear-gradient(45deg, ${theme.lineSoft}, ${theme.lineSoft} 3px, ${theme.line} 3px, ${theme.line} 6px)`,
      flexShrink: 0,
    }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: fonts.serif, fontSize: 17, color: theme.ink, lineHeight: 1.1 }}>{name}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 2 }}>{price}</div>
    </div>
    {status === 'added' && <Pill bg={theme.goodSoft} border={theme.good} color={theme.good} style={{ fontWeight: 600 }}>✓ ajouté</Pill>}
    {status === 'add' && (
      <button style={{
        background: theme.forest, color: theme.paper, border: 'none',
        padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>+ ajouter</button>
    )}
  </div>
);

const ScreenOnboard3 = () => (
  <StepFrame
    step={3}
    kicker="cap mental : 5, pas 50"
    title={<>Ajoute tes <Highlight>5 plats stars</Highlight></>}
    astuce={<><b>Astuce :</b> commence par tes best-sellers. L'IA déduira le reste depuis tes photos & menus PDF.</>}
    footer={
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: fonts.hand, fontSize: 16, color: theme.terracotta, flex: 1 }}>3/5 ajoutés · bravo</span>
        <Btn ghost style={{ color: theme.inkSoft }}>← retour</Btn>
        <Btn primary>Continuer →</Btn>
      </div>
    }>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PlatRow name="Burger maison" price="14 €" status="added" />
      <PlatRow name="Risotto champignon" price="17 €" status="added" />
      <PlatRow name="Salade chèvre chaud" price="13 €" status="added" />
      <PlatRow name="+ ajouter un plat (2 restants)" price="suggéré par l'IA" status="add" />
      <div style={{
        marginTop: 4, padding: '12px 14px',
        background: theme.mielSoft, border: `1px dashed ${theme.miel}`,
        borderRadius: 10, fontSize: 12, color: theme.ink, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span><b>Ou</b> dépose ton menu PDF, on extrait tout en 30 secondes.</span>
        <button style={{
          marginLeft: 'auto', background: theme.paper, border: `1px solid ${theme.line}`,
          padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>importer PDF</button>
      </div>
    </div>
  </StepFrame>
);

// ── Étape 4 — Canaux de commande ──────────────────────────────────────────

const ChannelTile = ({ name, sub, on, accent }) => (
  <div style={{
    padding: '14px 16px', borderRadius: 12,
    background: on ? theme.paper : theme.paperWarm,
    border: `1px solid ${on ? accent : theme.line}`,
    borderLeft: `4px solid ${on ? accent : theme.line}`,
    display: 'flex', alignItems: 'center', gap: 12,
    opacity: on ? 1 : 0.65,
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
      background: on ? accent + '22' : theme.lineSoft,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: fonts.serif, fontSize: 18, color: on ? accent : theme.inkMute,
    }}>{name[0]}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: fonts.serif, fontSize: 18, color: theme.ink, lineHeight: 1.1 }}>{name}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 2 }}>{sub}</div>
    </div>
    <span style={{
      width: 36, height: 22, borderRadius: 999, background: on ? theme.good : theme.line,
      padding: 2, display: 'flex', alignItems: 'center',
      justifyContent: on ? 'flex-end' : 'flex-start', transition: 'all .2s',
    }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: theme.paper, boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
    </span>
  </div>
);

const ScreenOnboard4 = () => (
  <StepFrame
    step={4}
    kicker="centralise tout en un seul écran"
    title="Branche tes canaux"
    astuce={<><b>C'est ici la magie :</b> toutes tes commandes — Uber, Deliveroo, site, téléphone — arrivent dans le même flux KDS. Plus jamais de tablette qui sonne dans le coin.</>}
    footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ fontFamily: fonts.hand, fontSize: 15, color: theme.terracotta, alignSelf: 'center' }}>3 canaux actifs · gain estimé : ~2h / jour</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn ghost style={{ color: theme.inkSoft }}>← retour</Btn>
          <Btn primary>Continuer →</Btn>
        </div>
      </div>
    }>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ChannelTile name="Uber Eats"  sub="connecté · API live"      on accent={theme.good} />
      <ChannelTile name="Deliveroo"  sub="connecté · API live"      on accent={theme.good} />
      <ChannelTile name="Site web"   sub="auto · widget intégré"    on accent={theme.terracotta} />
      <ChannelTile name="Téléphone"  sub="à brancher · IA vocale"      accent={theme.miel} />
      <ChannelTile name="Just Eat"   sub="à brancher"                  accent={theme.miel} />
    </div>
  </StepFrame>
);

// ── Étape 5 — Ton équipe ──────────────────────────────────────────────────

const TeamRow = ({ name, role, color, status }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: theme.paper, border: `1px solid ${theme.line}` }}>
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: fonts.serif, fontSize: 16, color: theme.paper,
    }}>{name[0]}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: fonts.serif, fontSize: 17, color: theme.ink, lineHeight: 1.1 }}>{name}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkMute, marginTop: 2 }}>{role}</div>
    </div>
    {status === 'invited' && <Pill bg={theme.mielSoft} border={theme.miel} color={theme.warn}>invité · en attente</Pill>}
    {status === 'active' && <Pill bg={theme.goodSoft} border={theme.good} color={theme.good}>✓ actif</Pill>}
  </div>
);

const ScreenOnboard5 = () => (
  <StepFrame
    step={5}
    kicker="qui voit quoi"
    title="Ajoute ton équipe"
    astuce={<><b>Les rôles importent peu pour démarrer :</b> tu peux affiner les permissions plus tard depuis Réglages.</>}
    footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn ghost style={{ color: theme.inkSoft }}>← retour</Btn>
        <Btn ghost style={{ color: theme.inkSoft }}>tu peux sauter</Btn>
        <Btn primary>Continuer →</Btn>
      </div>
    }>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <TeamRow name="Marie Dubois" role="Manager · accès complet (toi)" color={theme.forest} status="active" />
      <TeamRow name="Lucas Martin" role="Cuisine · KDS seul"           color={theme.terracotta} status="active" />
      <TeamRow name="Aïcha Benz"   role="Salle · plan + commandes"     color={theme.miel} status="invited" />
      <div style={{
        padding: '12px 14px', borderRadius: 10,
        border: `2px dashed ${theme.line}`, background: 'transparent',
        display: 'flex', alignItems: 'center', gap: 10,
        color: theme.inkMute, fontSize: 13,
      }}>
        <span style={{
          width: 36, height: 36, borderRadius: '50%', border: `2px dashed ${theme.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: theme.inkMute,
        }}>+</span>
        <span>inviter par email · ou lien partageable</span>
        <button style={{
          marginLeft: 'auto', background: theme.paper, border: `1px solid ${theme.line}`,
          padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: theme.ink,
        }}>générer lien</button>
      </div>
    </div>
  </StepFrame>
);

// ── Étape 6 — Récompense ──────────────────────────────────────────────────

const ScreenOnboard6 = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    <Steps active={6} />
    <Card style={{ flex: 1, padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18, position: 'relative', overflow: 'hidden' }}>
      {/* confetti dots */}
      {[
        { x: 18, y: 22, c: theme.terracotta, s: 6 },
        { x: 80, y: 18, c: theme.miel, s: 8 },
        { x: 12, y: 60, c: theme.good, s: 5 },
        { x: 88, y: 65, c: theme.terracotta, s: 6 },
        { x: 30, y: 12, c: theme.miel, s: 4 },
        { x: 70, y: 85, c: theme.good, s: 5 },
      ].map((d, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${d.x}%`, top: `${d.y}%`,
          width: d.s, height: d.s, borderRadius: 2, background: d.c, transform: `rotate(${i * 25}deg)`,
        }} />
      ))}

      <ChefPixel size={140} mood="happy" pulsing />

      <div>
        <div style={{ fontFamily: fonts.hand, fontSize: 26, color: theme.terracotta, lineHeight: 1 }}>Bravo Marie 🎉</div>
        <h1 style={{ fontFamily: fonts.serif, fontSize: 40, lineHeight: 1.05, color: theme.ink, margin: '6px 0 0', fontWeight: 400 }}>
          Ton resto est <Highlight>prêt à servir</Highlight>
        </h1>
      </div>
      <p style={{ fontFamily: fonts.ui, fontSize: 14, color: theme.inkSoft, lineHeight: 1.5, maxWidth: 340, margin: 0 }}>
        Je t'envoie un <b>1er ticket de démo</b> dans la cuisine pour tester. Tu peux aussi explorer le dashboard tout de suite.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn primary style={{ padding: '12px 22px', fontSize: 14 }}>Lancer la démo</Btn>
        <Btn style={{ padding: '12px 18px', fontSize: 14 }}>Voir mon dashboard</Btn>
      </div>

      <div style={{
        marginTop: 12, display: 'flex', gap: 10,
        padding: '10px 14px', borderRadius: 999, background: theme.paperWarm, border: `1px solid ${theme.line}`,
      }}>
        <span style={{
          padding: '5px 11px', borderRadius: 999,
          background: theme.terracotta, color: theme.paper, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        }}>+50 pts</span>
        <span style={{
          padding: '5px 11px', borderRadius: 999,
          background: theme.forest, color: theme.paper, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        }}>Lvl 1 · explorateur</span>
        <span style={{ fontSize: 11.5, color: theme.inkSoft, alignSelf: 'center' }}>débloque Lvl 2 en envoyant 10 cmds</span>
      </div>
    </Card>
  </div>
);

// ── Tour guidé in-app ─────────────────────────────────────────────────────

const ScreenTourGuide = () => (
  <div style={{
    width: '100%', height: '100%', background: theme.sable,
    padding: 22, fontFamily: fonts.ui, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden',
  }}>
    <div>
      <div style={{ fontFamily: fonts.hand, fontSize: 17, color: theme.terracotta, lineHeight: 1 }}>au 1er service · 5 bulles · skippable</div>
      <div style={{ fontFamily: fonts.serif, fontSize: 28, color: theme.ink, marginTop: 4 }}>Tour guidé dans l'app</div>
    </div>

    {/* Mini fake-app behind */}
    <Card style={{ flex: 1, padding: 14, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        background: theme.paperWarm, borderRadius: 10, padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
      }}>
        <div style={{ fontFamily: fonts.serif, fontSize: 18, color: theme.ink }}>CommandeIA</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Service', 'KDS', 'Salle'].map((t, i) => (
            <span key={t} style={{
              padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: i === 1 ? theme.forest : theme.paper, color: i === 1 ? theme.paper : theme.inkSoft,
              border: i === 1 ? 'none' : `1px solid ${theme.line}`,
            }}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { l: 'EN COURS', v: '12', bg: theme.goodSoft, c: theme.good },
          { l: 'PRÊTES',   v: '8',  bg: theme.paper,    c: theme.ink },
          { l: 'MOY TEMPS',v: "18'", bg: theme.paper,   c: theme.ink },
        ].map(k => (
          <div key={k.l} style={{ padding: 14, borderRadius: 10, background: k.bg, border: `1px solid ${theme.line}` }}>
            <div style={{ fontSize: 10, letterSpacing: 0.8, color: theme.inkMute, fontWeight: 600, textTransform: 'uppercase' }}>{k.l}</div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, color: k.c, lineHeight: 1, marginTop: 4 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: theme.paperWarm, height: 100, borderRadius: 10, opacity: 0.5 }} />

      {/* Spotlight on first KPI */}
      <div style={{
        position: 'absolute', top: 64, left: 18, right: '66%', height: 88,
        borderRadius: 10, boxShadow: `0 0 0 9999px rgba(20, 30, 25, 0.45)`,
        pointerEvents: 'none',
      }} />

      {/* Tooltip bubble */}
      <div style={{
        position: 'absolute', top: 80, left: '36%',
        width: 280, background: theme.miel, borderRadius: 12,
        padding: '14px 16px', boxShadow: '0 12px 32px -8px rgba(0,0,0,.25)',
      }}>
        <div style={{
          position: 'absolute', left: -8, top: 28, width: 16, height: 16,
          background: theme.miel, transform: 'rotate(45deg)', borderRadius: 2,
        }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <ChefPixel size={34} mood="thinking" />
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 1.15, color: theme.ink }}>
              Ici tes commandes en cours
            </div>
            <div style={{ fontSize: 12, color: theme.ink, marginTop: 4, lineHeight: 1.4 }}>
              Cliques sur une carte pour voir le détail. Les rouges = en retard.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 11, color: theme.inkSoft }}>2/5</span>
              <button style={{
                background: theme.forest, color: theme.paper, border: 'none',
                padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>suivant →</button>
            </div>
          </div>
        </div>
      </div>
    </Card>

    <Astuce>
      <b>Au 1er service :</b> 5 bulles qui pointent les éléments clés. Skippable, réactivable depuis l'aide. Ça remplace 80% du support démarrage.
    </Astuce>
  </div>
);

Object.assign(window, { ScreenOnboard2, ScreenOnboard3, ScreenOnboard4, ScreenOnboard5, ScreenOnboard6, ScreenTourGuide });
