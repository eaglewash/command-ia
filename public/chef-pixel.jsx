// Chef Pixel — la mascotte. Composition de formes primitives (cercles, arcs).
// Trois moods: 'happy', 'thinking', 'alert'. Pulse via CSS.

const ChefPixel = ({ size = 96, mood = 'happy', pulsing = false }) => {
  // Couleurs
  const pan = '#1F3A2E';      // vert forêt = corps "poêle"
  const yolk = '#F4C43C';     // jaune miel = jaune d'œuf
  const white = '#FBF8F0';    // blanc d'œuf
  const accent = '#D97548';   // terracotta
  const eyeColor = '#1F1A14';

  // Eye + mouth positions vary par mood
  const eyes = {
    happy:    { lx: 38, ly: 46, rx: 58, ry: 46, shape: 'dot' },
    thinking: { lx: 38, ly: 46, rx: 58, ry: 46, shape: 'arc' },
    alert:    { lx: 38, ly: 44, rx: 58, ry: 44, shape: 'wide' },
  }[mood];

  const mouth = {
    happy:    <path d="M 42 58 Q 48 64 54 58" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" fill="none" />,
    thinking: <line x1="44" y1="60" x2="52" y2="60" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />,
    alert:    <ellipse cx="48" cy="60" rx="3" ry="4" fill={eyeColor} />,
  }[mood];

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        animation: pulsing ? 'cp-bob 2.6s ease-in-out infinite' : 'none',
      }}
    >
      <style>{`
        @keyframes cp-bob {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50%      { transform: translateY(-4px) rotate(2deg); }
        }
        @keyframes cp-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.1); }
        }
        .cp-eye { transform-origin: center; animation: cp-blink 4.2s ease-in-out infinite; }
        @keyframes cp-steam {
          0%   { transform: translateY(0) scale(1); opacity: 0.65; }
          100% { transform: translateY(-14px) scale(1.4); opacity: 0; }
        }
        .cp-steam { animation: cp-steam 2.2s ease-out infinite; transform-origin: center bottom; }
      `}</style>

      <svg viewBox="0 0 96 96" width={size} height={size} style={{ overflow: 'visible' }}>
        {/* vapeur */}
        <g opacity="0.6">
          <circle className="cp-steam" cx="40" cy="14" r="3" fill="#E8D9C2" style={{ animationDelay: '0s' }} />
          <circle className="cp-steam" cx="50" cy="10" r="2.5" fill="#E8D9C2" style={{ animationDelay: '0.7s' }} />
          <circle className="cp-steam" cx="58" cy="14" r="3" fill="#E8D9C2" style={{ animationDelay: '1.4s' }} />
        </g>

        {/* manche de la poêle */}
        <rect x="78" y="44" width="20" height="6" rx="3" fill={pan} />
        <rect x="92" y="42" width="6" height="10" rx="2" fill="#0F2419" />

        {/* corps poêle */}
        <circle cx="48" cy="52" r="32" fill={pan} />

        {/* "intérieur" — l'œuf */}
        <circle cx="48" cy="52" r="26" fill={white} />

        {/* jaune central — halo + cercle */}
        <circle cx="48" cy="52" r="22" fill={yolk} opacity="0.3" />
        <circle cx="48" cy="52" r="17" fill={yolk} />

        {/* yeux */}
        {eyes.shape === 'dot' && (
          <>
            <circle className="cp-eye" cx={eyes.lx} cy={eyes.ly} r="2.4" fill={eyeColor} />
            <circle className="cp-eye" cx={eyes.rx} cy={eyes.ry} r="2.4" fill={eyeColor} style={{ animationDelay: '0.05s' }} />
          </>
        )}
        {eyes.shape === 'arc' && (
          <>
            <path d={`M ${eyes.lx - 3} ${eyes.ly} Q ${eyes.lx} ${eyes.ly - 3} ${eyes.lx + 3} ${eyes.ly}`} stroke={eyeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d={`M ${eyes.rx - 3} ${eyes.ry} Q ${eyes.rx} ${eyes.ry - 3} ${eyes.rx + 3} ${eyes.ry}`} stroke={eyeColor} strokeWidth="2" strokeLinecap="round" fill="none" />
          </>
        )}
        {eyes.shape === 'wide' && (
          <>
            <circle cx={eyes.lx} cy={eyes.ly} r="3.2" fill={white} stroke={eyeColor} strokeWidth="1.2" />
            <circle cx={eyes.lx} cy={eyes.ly + 0.5} r="1.6" fill={eyeColor} />
            <circle cx={eyes.rx} cy={eyes.ry} r="3.2" fill={white} stroke={eyeColor} strokeWidth="1.2" />
            <circle cx={eyes.rx} cy={eyes.ry + 0.5} r="1.6" fill={eyeColor} />
          </>
        )}

        {/* joues rosées (toujours) */}
        <circle cx="34" cy="56" r="3" fill={accent} opacity="0.35" />
        <circle cx="62" cy="56" r="3" fill={accent} opacity="0.35" />

        {/* bouche */}
        {mouth}
      </svg>
    </div>
  );
};

Object.assign(window, { ChefPixel });
