// Chef Pixel — Assistant IA conversational panel

const ChatBubble = ({ from = 'pixel', children, action }) => (
  <div style={{
    display: 'flex',
    justifyContent: from === 'pixel' ? 'flex-start' : 'flex-end',
    gap: 8,
  }}>
    <div style={{
      maxWidth: '88%',
      background: from === 'pixel' ? theme.paper : theme.forest,
      color: from === 'pixel' ? theme.ink : theme.paper,
      border: from === 'pixel' ? `1px solid ${theme.line}` : 'none',
      borderRadius: from === 'pixel' ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
      padding: '11px 14px',
      fontFamily: fonts.ui, fontSize: 13.5, lineHeight: 1.45,
    }}>
      {children}
      {action && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {action.map((a, i) => (
            <button key={i} style={{
              fontFamily: fonts.ui, fontSize: 12, fontWeight: 600,
              padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
              background: a.primary ? theme.terracotta : 'transparent',
              color: a.primary ? theme.paper : theme.ink,
              border: a.primary ? 'none' : `1px solid ${theme.line}`,
            }}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  </div>
);

const ScreenChefPixel = () => (
  <div style={{
    width: '100%', height: '100%',
    background: theme.sable,
    padding: 22,
    fontFamily: fonts.ui,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column', gap: 14,
  }}>
    {/* Mascot header */}
    <div style={{
      background: theme.forest,
      borderRadius: 16,
      padding: '22px 22px 24px',
      color: theme.paper,
      display: 'flex', alignItems: 'center', gap: 18,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* dotted bg */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(${theme.paper}22 1px, transparent 1px)`,
        backgroundSize: '14px 14px',
        opacity: 0.4,
      }} />
      <div style={{ position: 'relative' }}>
        <ChefPixel size={88} mood="happy" pulsing />
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        <div style={{ fontFamily: fonts.hand, fontSize: 18, color: theme.miel, lineHeight: 1 }}>
          ton assistant IA
        </div>
        <div style={{ fontFamily: fonts.serif, fontSize: 32, lineHeight: 1.05, marginTop: 4 }}>
          Chef Pixel
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 6 }}>
          analyse 47 cmds en direct · suggère des actions
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
          background: theme.paper + '14', padding: '4px 10px', borderRadius: 999,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: theme.miel,
            boxShadow: `0 0 8px ${theme.miel}` }} />
          en ligne
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, opacity: 0.6 }}>v2.4 · GPT-4o</span>
      </div>
    </div>

    {/* Conversation */}
    <div style={{
      flex: 1, minHeight: 0, overflow: 'hidden',
      background: theme.paperWarm,
      borderRadius: 14,
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontFamily: fonts.hand, fontSize: 16, color: theme.terracotta, textAlign: 'center', marginBottom: 4 }}>
        Aujourd'hui · 19:41
      </div>

      <ChatBubble from="pixel">
        Tu as <b>2 desserts qui prennent du retard</b> côté table 7. On envoie un café offert pour patienter&nbsp;?
        <div style={{
          marginTop: 8, display: 'flex', gap: 6,
        }}>
          <button style={{ fontFamily: fonts.ui, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 999, background: theme.terracotta, color: theme.paper, border: 'none', cursor: 'pointer' }}>Oui, envoyer</button>
          <button style={{ fontFamily: fonts.ui, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 999, background: 'transparent', color: theme.ink, border: `1px solid ${theme.line}`, cursor: 'pointer' }}>Plus tard</button>
        </div>
      </ChatBubble>

      <ChatBubble from="user">
        Oui, envoie ✓
      </ChatBubble>

      <ChatBubble from="pixel">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: theme.good }} />
          C'est parti vers la table 7. <Highlight>+1 client sauvé</Highlight>
        </span>
      </ChatBubble>

      <ChatBubble from="pixel">
        <div style={{ marginBottom: 6 }}>
          <b>Vendredi prochain</b> s'annonce comme un gros service (<span style={{ color: theme.good, fontWeight: 700 }}>+30%</span> vs moyenne). On augmente le stock de viande&nbsp;?
        </div>
        <div style={{
          background: theme.mielSoft, border: `1px dashed ${theme.miel}`,
          borderRadius: 8, padding: '8px 10px', fontSize: 12, color: theme.ink,
          display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 3, columnGap: 10,
        }}>
          <span>Bœuf haché</span><span style={{ fontFamily: fonts.mono, color: theme.terracotta, fontWeight: 700 }}>+4 kg</span>
          <span>Magret canard</span><span style={{ fontFamily: fonts.mono, color: theme.terracotta, fontWeight: 700 }}>+2 kg</span>
          <span>Saumon</span><span style={{ fontFamily: fonts.mono, color: theme.terracotta, fontWeight: 700 }}>+1.5 kg</span>
        </div>
      </ChatBubble>

      {/* Composer */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1, background: theme.paper, border: `1px solid ${theme.line}`,
          borderRadius: 10, padding: '10px 14px',
          color: theme.inkMute, fontSize: 13,
        }}>
          Demande à Chef Pixel…
        </div>
        <button style={{
          background: theme.forest, color: theme.paper, border: 'none',
          width: 40, height: 40, borderRadius: 10, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M2 8 L14 2 L10 14 L8 9 Z" fill="currentColor" /></svg>
        </button>
      </div>
    </div>
  </div>
);

Object.assign(window, { ScreenChefPixel });
