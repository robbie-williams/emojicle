'use strict';

// ── Coordinate reference (viewBox 0 0 200 220) ──────────────────────────────
// Face circle centre: (100, 120), radius 82
//   Top of face: y≈38, Bottom: y≈202
// Eyes:     L=(72,106)  R=(128,106)
// Eyebrows: L=(72,88)   R=(128,88)
// Nose:     (100,118)
// Mouth:    centre y≈148, spans x 72-128
// Accessories: y=5–38 (above face) or ears/sides

// ── Part Definitions ─────────────────────────────────────────────────────────

const PARTS = {

  // ── FACES ────────────────────────────────────────────────────────────────
  face: [
    { name: 'Sunshine',
      svg: `<circle cx="100" cy="120" r="82" fill="#FFD93D" stroke="#E8B800" stroke-width="3"/>` },
    { name: 'Tangerine',
      svg: `<circle cx="100" cy="120" r="82" fill="#FF8C42" stroke="#D96000" stroke-width="3"/>` },
    { name: 'Peachy',
      svg: `<circle cx="100" cy="120" r="82" fill="#FFBF99" stroke="#D4845A" stroke-width="3"/>` },
    { name: 'Mocha',
      svg: `<circle cx="100" cy="120" r="82" fill="#C68642" stroke="#8B5A1A" stroke-width="3"/>` },
    { name: 'Bubblegum',
      svg: `<circle cx="100" cy="120" r="82" fill="#FF85A1" stroke="#D44070" stroke-width="3"/>` },
    { name: 'Lavender',
      svg: `<circle cx="100" cy="120" r="82" fill="#B794F4" stroke="#7C4DDB" stroke-width="3"/>` },
    { name: 'Mint',
      svg: `<circle cx="100" cy="120" r="82" fill="#6EE7B7" stroke="#20A870" stroke-width="3"/>` },
    { name: 'Sky Blue',
      svg: `<circle cx="100" cy="120" r="82" fill="#7EC8E3" stroke="#2E90C5" stroke-width="3"/>` },
    { name: 'Lemon Square',
      svg: `<rect x="16" y="36" width="168" height="168" rx="46" fill="#FFE566" stroke="#D4B000" stroke-width="3"/>` },
    { name: 'Coral Square',
      svg: `<rect x="16" y="36" width="168" height="168" rx="46" fill="#FF7B72" stroke="#D03020" stroke-width="3"/>` },
    { name: 'Lime Square',
      svg: `<rect x="16" y="36" width="168" height="168" rx="46" fill="#A8E63C" stroke="#5A9A00" stroke-width="3"/>` },
    { name: 'Berry Square',
      svg: `<rect x="16" y="36" width="168" height="168" rx="46" fill="#F472B6" stroke="#B0106A" stroke-width="3"/>` },
    { name: 'Chubby Sun',
      svg: `<ellipse cx="100" cy="120" rx="94" ry="76" fill="#FFD93D" stroke="#E8B800" stroke-width="3"/>` },
    { name: 'Chubby Pink',
      svg: `<ellipse cx="100" cy="120" rx="94" ry="76" fill="#FF85A1" stroke="#D44070" stroke-width="3"/>` },
    { name: 'Tall Peach',
      svg: `<ellipse cx="100" cy="120" rx="68" ry="88" fill="#FFBF99" stroke="#D4845A" stroke-width="3"/>` },
    { name: 'Tall Blue',
      svg: `<ellipse cx="100" cy="120" rx="68" ry="88" fill="#7EC8E3" stroke="#2E90C5" stroke-width="3"/>` },
  ],

  // ── EYES ─────────────────────────────────────────────────────────────────
  eyes: [
    { name: 'Classic',
      svg: `
        <circle cx="72" cy="106" r="14" fill="white"/>
        <circle cx="75" cy="108" r="9" fill="#2B2B2B"/>
        <circle cx="78" cy="104" r="3.5" fill="white"/>
        <circle cx="128" cy="106" r="14" fill="white"/>
        <circle cx="131" cy="108" r="9" fill="#2B2B2B"/>
        <circle cx="134" cy="104" r="3.5" fill="white"/>` },
    { name: 'Big Sparkle',
      svg: `
        <circle cx="72" cy="106" r="17" fill="white"/>
        <circle cx="74" cy="108" r="11" fill="#2B2B2B"/>
        <circle cx="78" cy="102" r="5" fill="white"/>
        <circle cx="68" cy="109" r="2" fill="white"/>
        <circle cx="128" cy="106" r="17" fill="white"/>
        <circle cx="130" cy="108" r="11" fill="#2B2B2B"/>
        <circle cx="134" cy="102" r="5" fill="white"/>
        <circle cx="124" cy="109" r="2" fill="white"/>` },
    { name: 'Cute Dots',
      svg: `
        <circle cx="72" cy="106" r="8" fill="#2B2B2B"/>
        <circle cx="128" cy="106" r="8" fill="#2B2B2B"/>
        <circle cx="75" cy="103" r="3" fill="white"/>
        <circle cx="131" cy="103" r="3" fill="white"/>` },
    { name: 'Heart Eyes',
      svg: `
        <path d="M72,99 C72,96 68,94 65,96 C62,98 63,103 72,110 C81,103 82,98 79,96 C76,94 72,96 72,99Z" fill="#FF3D6A"/>
        <path d="M128,99 C128,96 124,94 121,96 C118,98 119,103 128,110 C137,103 138,98 135,96 C132,94 128,96 128,99Z" fill="#FF3D6A"/>` },
    { name: 'Star Eyes',
      svg: `
        <polygon points="72,95 74,102 81,102 75.5,107 77.5,114 72,109 66.5,114 68.5,107 63,102 70,102" fill="#FFD700"/>
        <polygon points="128,95 130,102 137,102 131.5,107 133.5,114 128,109 122.5,114 124.5,107 119,102 126,102" fill="#FFD700"/>` },
    { name: 'Sleepy',
      svg: `
        <path d="M58,108 Q72,100 86,108" stroke="#2B2B2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M60,112 Q72,117 84,112" stroke="#2B2B2B" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.4"/>
        <path d="M114,108 Q128,100 142,108" stroke="#2B2B2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M116,112 Q128,117 140,112" stroke="#2B2B2B" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.4"/>` },
    { name: 'Wink',
      svg: `
        <path d="M58,106 Q72,99 86,106" stroke="#2B2B2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <circle cx="128" cy="106" r="14" fill="white"/>
        <circle cx="131" cy="108" r="9" fill="#2B2B2B"/>
        <circle cx="134" cy="104" r="3.5" fill="white"/>` },
    { name: 'X Eyes',
      svg: `
        <line x1="61" y1="96" x2="83" y2="118" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>
        <line x1="83" y1="96" x2="61" y2="118" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>
        <line x1="117" y1="96" x2="139" y2="118" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>
        <line x1="139" y1="96" x2="117" y2="118" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>` },
    { name: 'Wide Open',
      svg: `
        <circle cx="72" cy="106" r="18" fill="white"/>
        <circle cx="72" cy="106" r="11" fill="#2B2B2B"/>
        <circle cx="76" cy="101" r="5" fill="white"/>
        <circle cx="128" cy="106" r="18" fill="white"/>
        <circle cx="128" cy="106" r="11" fill="#2B2B2B"/>
        <circle cx="132" cy="101" r="5" fill="white"/>` },
    { name: 'Squiggly',
      svg: `
        <path d="M58,106 C62,99 68,114 72,107 C76,100 82,114 86,107" stroke="#2B2B2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M114,106 C118,99 124,114 128,107 C132,100 138,114 142,107" stroke="#2B2B2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
    { name: 'Teary',
      svg: `
        <circle cx="72" cy="106" r="14" fill="white"/>
        <circle cx="75" cy="108" r="9" fill="#2B2B2B"/>
        <circle cx="78" cy="104" r="3.5" fill="white"/>
        <path d="M72,120 Q68,132 62,140 Q68,142 72,140 Q78,138 76,130Z" fill="#7BBCFF" opacity="0.85"/>
        <circle cx="128" cy="106" r="14" fill="white"/>
        <circle cx="131" cy="108" r="9" fill="#2B2B2B"/>
        <circle cx="134" cy="104" r="3.5" fill="white"/>
        <path d="M128,120 Q124,132 118,140 Q124,142 128,140 Q134,138 132,130Z" fill="#7BBCFF" opacity="0.85"/>` },
    { name: 'Rolling',
      svg: `
        <circle cx="72" cy="106" r="14" fill="white"/>
        <circle cx="72" cy="99" r="9" fill="#2B2B2B"/>
        <circle cx="75" cy="96" r="3.5" fill="white"/>
        <circle cx="128" cy="106" r="14" fill="white"/>
        <circle cx="128" cy="99" r="9" fill="#2B2B2B"/>
        <circle cx="131" cy="96" r="3.5" fill="white"/>` },
  ],

  // ── EYEBROWS ─────────────────────────────────────────────────────────────
  eyebrows: [
    { name: 'None',
      svg: `` },
    { name: 'Arched',
      svg: `
        <path d="M57,84 Q72,74 87,82" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M113,82 Q128,74 143,84" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    { name: 'Thick',
      svg: `
        <path d="M57,84 Q72,76 87,84" stroke="#2B2B2B" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M113,84 Q128,76 143,84" stroke="#2B2B2B" stroke-width="6" fill="none" stroke-linecap="round"/>` },
    { name: 'Raised',
      svg: `
        <path d="M57,77 Q72,68 87,75" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M113,75 Q128,68 143,77" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    { name: 'Angry',
      svg: `
        <path d="M57,77 Q72,86 87,82" stroke="#2B2B2B" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M113,82 Q128,86 143,77" stroke="#2B2B2B" stroke-width="4.5" fill="none" stroke-linecap="round"/>` },
    { name: 'Worried',
      svg: `
        <path d="M57,82 Q64,74 72,80 Q80,86 87,79" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M113,79 Q120,86 128,80 Q136,74 143,82" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>` },
    { name: 'Bushy',
      svg: `
        <path d="M55,84 Q72,74 89,84" stroke="#2B2B2B" stroke-width="9" fill="none" stroke-linecap="round"/>
        <path d="M111,84 Q128,74 145,84" stroke="#2B2B2B" stroke-width="9" fill="none" stroke-linecap="round"/>` },
    { name: 'Playful Tilt',
      svg: `
        <path d="M60,86 Q72,78 84,82" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M116,82 Q128,78 140,86" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  ],

  // ── NOSE ─────────────────────────────────────────────────────────────────
  nose: [
    { name: 'None',
      svg: `` },
    { name: 'Button',
      svg: `<circle cx="100" cy="118" r="4.5" fill="#2B2B2B" opacity="0.45"/>` },
    { name: 'Two Dots',
      svg: `
        <circle cx="93" cy="118" r="4" fill="#2B2B2B" opacity="0.4"/>
        <circle cx="107" cy="118" r="4" fill="#2B2B2B" opacity="0.4"/>` },
    { name: 'Triangle',
      svg: `<polygon points="100,108 110,124 90,124" fill="#2B2B2B" opacity="0.3"/>` },
    { name: 'Pig Snout',
      svg: `
        <ellipse cx="100" cy="120" rx="15" ry="11" fill="#FFAAAA" stroke="#CC7777" stroke-width="1.5"/>
        <circle cx="93" cy="120" r="4.5" fill="#CC5555"/>
        <circle cx="107" cy="120" r="4.5" fill="#CC5555"/>` },
    { name: 'Cat Nose',
      svg: `
        <path d="M96,112 L104,112 L100,118Z" fill="#FF8FA3"/>
        <line x1="100" y1="118" x2="100" y2="126" stroke="#2B2B2B" stroke-width="1.5"/>
        <path d="M100,126 Q90,122 84,126" stroke="#2B2B2B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M100,126 Q110,122 116,126" stroke="#2B2B2B" stroke-width="1.5" fill="none" stroke-linecap="round"/>` },
    { name: 'Freckles',
      svg: `
        <circle cx="74" cy="114" r="3.5" fill="#C47B5A" opacity="0.5"/>
        <circle cx="82" cy="119" r="3.5" fill="#C47B5A" opacity="0.5"/>
        <circle cx="77" cy="126" r="3.5" fill="#C47B5A" opacity="0.5"/>
        <circle cx="126" cy="114" r="3.5" fill="#C47B5A" opacity="0.5"/>
        <circle cx="118" cy="119" r="3.5" fill="#C47B5A" opacity="0.5"/>
        <circle cx="123" cy="126" r="3.5" fill="#C47B5A" opacity="0.5"/>` },
    { name: 'Blush',
      svg: `
        <ellipse cx="68" cy="120" rx="16" ry="10" fill="#FF7777" opacity="0.28"/>
        <ellipse cx="132" cy="120" rx="16" ry="10" fill="#FF7777" opacity="0.28"/>` },
  ],

  // ── MOUTH ────────────────────────────────────────────────────────────────
  mouth: [
    { name: 'Big Smile',
      svg: `<path d="M72,145 Q100,170 128,145" stroke="#2B2B2B" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    { name: 'Open Grin',
      svg: `
        <path d="M72,145 Q100,172 128,145Z" fill="#2B2B2B"/>
        <path d="M74,145 Q100,168 126,145Z" fill="white"/>
        <path d="M74,145 Q100,156 126,145Z" fill="#E03030"/>` },
    { name: 'Sad',
      svg: `<path d="M72,158 Q100,140 128,158" stroke="#2B2B2B" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    { name: 'Surprised O',
      svg: `
        <ellipse cx="100" cy="152" rx="15" ry="20" fill="#2B2B2B"/>
        <ellipse cx="100" cy="152" rx="10" ry="15" fill="#CC2020"/>` },
    { name: 'Smirk',
      svg: `<path d="M82,148 Q96,156 116,145" stroke="#2B2B2B" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    { name: 'Tongue Out',
      svg: `
        <path d="M78,144 Q100,162 122,144Z" fill="#2B2B2B"/>
        <path d="M80,144 Q100,158 120,144Z" fill="white"/>
        <ellipse cx="100" cy="162" rx="12" ry="10" fill="#FF6B6B"/>
        <line x1="100" y1="152" x2="100" y2="162" stroke="#E03030" stroke-width="1"/>` },
    { name: 'Neutral',
      svg: `<line x1="78" y1="150" x2="122" y2="150" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>` },
    { name: 'Wavy',
      svg: `<path d="M72,148 C82,140 92,158 100,150 C108,142 118,158 128,150" stroke="#2B2B2B" stroke-width="4" fill="none" stroke-linecap="round"/>` },
    { name: 'Kiss',
      svg: `
        <path d="M87,146 Q100,158 113,146Z" fill="#FF6688"/>
        <ellipse cx="100" cy="144" rx="9" ry="6" fill="#FF6688"/>
        <path d="M93,144 Q100,140 107,144" stroke="#CC3355" stroke-width="1" fill="none"/>` },
    { name: 'Big Laugh',
      svg: `
        <path d="M68,143 Q100,176 132,143Z" fill="#2B2B2B"/>
        <path d="M71,143 Q100,172 129,143Z" fill="white"/>
        <path d="M71,143 Q100,157 129,143Z" fill="#E03030"/>
        <line x1="82" y1="143" x2="82" y2="151" stroke="#AAAAAA" stroke-width="1.5"/>
        <line x1="91" y1="143" x2="91" y2="155" stroke="#AAAAAA" stroke-width="1.5"/>
        <line x1="100" y1="143" x2="100" y2="157" stroke="#AAAAAA" stroke-width="1.5"/>
        <line x1="109" y1="143" x2="109" y2="155" stroke="#AAAAAA" stroke-width="1.5"/>
        <line x1="118" y1="143" x2="118" y2="151" stroke="#AAAAAA" stroke-width="1.5"/>` },
  ],

  // ── EXTRAS ───────────────────────────────────────────────────────────────
  extras: [
    { name: 'None',
      svg: `` },

    { name: 'Party Hat',
      svg: `
        <path d="M100,5 L55,60 L145,60Z" fill="#FF4FA3" stroke="#CC0066" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="79" y1="16" x2="64" y2="52" stroke="#FFD700" stroke-width="3" stroke-linecap="round"/>
        <line x1="100" y1="9" x2="84" y2="55" stroke="#FFD700" stroke-width="3" stroke-linecap="round"/>
        <line x1="121" y1="16" x2="106" y2="54" stroke="#FFD700" stroke-width="3" stroke-linecap="round"/>
        <circle cx="100" cy="5" r="8" fill="#FFD700"/>
        <circle cx="100" cy="5" r="4" fill="#FF4FA3"/>
        <rect x="57" y="57" width="86" height="7" rx="3.5" fill="#CC0066"/>
        <path d="M58,62 Q68,85 30,112" stroke="#CC0066" stroke-width="1.5" fill="none" stroke-dasharray="4,3"/>` },

    { name: 'Sunglasses',
      svg: `
        <rect x="54" y="94" width="36" height="24" rx="12" fill="#111111"/>
        <rect x="110" y="94" width="36" height="24" rx="12" fill="#111111"/>
        <line x1="90" y1="106" x2="110" y2="106" stroke="#111111" stroke-width="3.5"/>
        <line x1="54" y1="106" x2="36" y2="110" stroke="#111111" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="146" y1="106" x2="164" y2="110" stroke="#111111" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M61,99 Q70,96 77,100" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.45"/>
        <path d="M117,99 Q126,96 133,100" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.45"/>` },

    { name: 'Nerd Glasses',
      svg: `
        <circle cx="72" cy="104" r="18" fill="#BCDFFB" opacity="0.4"/>
        <circle cx="72" cy="104" r="18" fill="none" stroke="#5C3A14" stroke-width="3"/>
        <circle cx="128" cy="104" r="18" fill="#BCDFFB" opacity="0.4"/>
        <circle cx="128" cy="104" r="18" fill="none" stroke="#5C3A14" stroke-width="3"/>
        <line x1="90" y1="104" x2="110" y2="104" stroke="#5C3A14" stroke-width="3"/>
        <line x1="54" y1="100" x2="36" y2="104" stroke="#5C3A14" stroke-width="3" stroke-linecap="round"/>
        <line x1="146" y1="100" x2="164" y2="104" stroke="#5C3A14" stroke-width="3" stroke-linecap="round"/>
        <rect x="93" y="101" width="14" height="5" rx="2.5" fill="white" stroke="#CCCCCC" stroke-width="1"/>` },

    { name: 'Crown',
      svg: `
        <path d="M50,55 L62,20 L80,44 L100,12 L120,44 L138,20 L150,55Z" fill="#FFD700" stroke="#B8860B" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="52" y="52" width="96" height="14" rx="7" fill="#E6A800"/>
        <circle cx="100" cy="22" r="8" fill="#FF3030"/>
        <circle cx="68" cy="38" r="6" fill="#3030FF"/>
        <circle cx="132" cy="38" r="6" fill="#30CC30"/>
        <circle cx="83" cy="30" r="4" fill="#FF30FF"/>
        <circle cx="117" cy="30" r="4" fill="#30FFFF"/>` },

    { name: 'Flower',
      svg: `
        <circle cx="156" cy="50" r="9" fill="#FF85A1"/>
        <circle cx="168" cy="42" r="9" fill="#FF85A1"/>
        <circle cx="174" cy="54" r="9" fill="#FF85A1"/>
        <circle cx="168" cy="64" r="9" fill="#FF85A1"/>
        <circle cx="156" cy="62" r="9" fill="#FF85A1"/>
        <circle cx="163" cy="53" r="11" fill="#FFE566"/>
        <circle cx="163" cy="53" r="5" fill="#E6A800"/>` },

    { name: 'Bow',
      svg: `
        <path d="M100,26 C100,26 80,10 62,16 C50,20 54,32 64,32 C74,32 88,24 100,26Z" fill="#FF4FA3" stroke="#CC0066" stroke-width="1"/>
        <path d="M100,26 C100,26 120,10 138,16 C150,20 146,32 136,32 C126,32 112,24 100,26Z" fill="#FF4FA3" stroke="#CC0066" stroke-width="1"/>
        <circle cx="100" cy="26" r="10" fill="#FF4FA3" stroke="#CC0066" stroke-width="1"/>
        <circle cx="100" cy="26" r="5" fill="#FF88CC"/>` },

    { name: 'Cowboy Hat',
      svg: `
        <ellipse cx="100" cy="48" rx="62" ry="9" fill="#6B4C2A" stroke="#3E2A0A" stroke-width="1.5"/>
        <rect x="64" y="10" width="72" height="40" rx="12" fill="#6B4C2A" stroke="#3E2A0A" stroke-width="1.5"/>
        <path d="M64,38 L136,38" stroke="#3E2A0A" stroke-width="1" fill="none"/>
        <rect x="64" y="36" width="72" height="8" rx="4" fill="#3E2A0A"/>
        <rect x="92" y="37" width="16" height="6" rx="3" fill="#FFD700"/>` },

    { name: 'Halo',
      svg: `
        <ellipse cx="100" cy="22" rx="42" ry="11" fill="none" stroke="#FFE566" stroke-width="7" opacity="0.95"/>
        <ellipse cx="100" cy="22" rx="42" ry="11" fill="none" stroke="#FFF9C4" stroke-width="3" opacity="0.7"/>` },

    { name: 'Cat Ears',
      svg: `
        <path d="M25,82 L30,30 L68,72Z" fill="#FFD93D" stroke="#E8B800" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M30,76 L35,40 L62,68Z" fill="#FF85A1"/>
        <path d="M175,82 L170,30 L132,72Z" fill="#FFD93D" stroke="#E8B800" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M170,76 L165,40 L138,68Z" fill="#FF85A1"/>` },

    { name: 'Headphones',
      svg: `
        <path d="M22,104 Q20,38 100,32 Q180,38 178,104" fill="none" stroke="#333333" stroke-width="7" stroke-linecap="round"/>
        <ellipse cx="22" cy="110" rx="14" ry="20" fill="#444444"/>
        <ellipse cx="22" cy="110" rx="9" ry="14" fill="#FF6B35"/>
        <ellipse cx="178" cy="110" rx="14" ry="20" fill="#444444"/>
        <ellipse cx="178" cy="110" rx="9" ry="14" fill="#FF6B35"/>` },

    { name: 'Devil Horns',
      svg: `
        <path d="M55,52 L40,10 L75,40Z" fill="#CC0000" stroke="#880000" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M145,52 L160,10 L125,40Z" fill="#CC0000" stroke="#880000" stroke-width="1.5" stroke-linejoin="round"/>` },
  ],
};

// ── Layer rendering order ─────────────────────────────────────────────────────

const LAYERS = ['face', 'extras', 'eyebrows', 'eyes', 'nose', 'mouth'];

const LAYER_LABELS = {
  face: 'Face',
  eyes: 'Eyes',
  eyebrows: 'Brows',
  nose: 'Nose',
  mouth: 'Mouth',
  extras: 'Extras',
};

// control row order (UI order, not render order)
const CONTROL_ORDER = ['face', 'eyes', 'eyebrows', 'nose', 'mouth', 'extras'];

// ── State ─────────────────────────────────────────────────────────────────────

const state = {};
LAYERS.forEach(l => { state[l] = 0; });

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderLayer(layer) {
  const part = PARTS[layer][state[layer]];
  const g = document.getElementById('layer-' + layer);
  if (g) g.innerHTML = part.svg;
  const nameEl = document.getElementById('name-' + layer);
  if (nameEl) nameEl.textContent = part.name;
}

function renderAll() {
  LAYERS.forEach(renderLayer);
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(layer, dir) {
  const len = PARTS[layer].length;
  state[layer] = ((state[layer] + dir) % len + len) % len;
  renderLayer(layer);
}

// ── Randomise ─────────────────────────────────────────────────────────────────

function randomise() {
  LAYERS.forEach(layer => {
    state[layer] = Math.floor(Math.random() * PARTS[layer].length);
  });
  renderAll();
  pulse('btn-random');
}

// ── Dance ─────────────────────────────────────────────────────────────────────
// Extensible move registry — add new dances here. Each move injects arm SVG into
// #layer-arms and applies a CSS class to #dance-group that drives the keyframes
// (defined in style.css). The Dance button picks a random available move.

const ARMS_SVG = `
  <g class="arm arm-left">
    <path d="M34,150 Q22,172 14,190" fill="none" stroke="#2B2B2B" stroke-width="11" stroke-linecap="round"/>
    <circle cx="14" cy="190" r="9" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2.5"/>
  </g>
  <g class="arm arm-right">
    <path d="M166,150 Q178,172 186,190" fill="none" stroke="#2B2B2B" stroke-width="11" stroke-linecap="round"/>
    <circle cx="186" cy="190" r="9" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2.5"/>
  </g>`;

const DANCES = {
  tango: { name: 'Tango', emoji: '\u{1F483}', duration: 5000, cssClass: 'dance-tango', arms: ARMS_SVG },
  // add more moves here later…
};

let dancing = false;

function dance(key) {
  if (dancing) return;
  const keys = Object.keys(DANCES);
  const move = DANCES[key] || DANCES[keys[Math.floor(Math.random() * keys.length)]];

  dancing = true;
  const group = document.getElementById('dance-group');
  const arms = document.getElementById('layer-arms');
  arms.innerHTML = move.arms;
  group.classList.add('dancing', move.cssClass);
  pulse('btn-dance');
  showToast(move.emoji + ' ' + move.name + '!');

  setTimeout(() => {
    group.classList.remove('dancing', move.cssClass);
    arms.innerHTML = '';
    dancing = false;
  }, move.duration);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Button pulse ──────────────────────────────────────────────────────────────

function pulse(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 200);
}

// ── Build controls ────────────────────────────────────────────────────────────

function buildControls() {
  const container = document.getElementById('controls');

  CONTROL_ORDER.forEach(layer => {
    const row = document.createElement('div');
    row.className = 'layer-row';

    const label = document.createElement('span');
    label.className = 'layer-label';
    label.textContent = LAYER_LABELS[layer];

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-nav';
    prevBtn.setAttribute('aria-label', 'Previous ' + LAYER_LABELS[layer]);
    prevBtn.innerHTML = '&#8592;';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'part-name';
    nameSpan.id = 'name-' + layer;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-nav';
    nextBtn.setAttribute('aria-label', 'Next ' + LAYER_LABELS[layer]);
    nextBtn.innerHTML = '&#8594;';

    prevBtn.addEventListener('click', () => navigate(layer, -1));
    nextBtn.addEventListener('click', () => navigate(layer, 1));

    row.appendChild(label);
    row.appendChild(prevBtn);
    row.appendChild(nameSpan);
    row.appendChild(nextBtn);
    container.appendChild(row);
  });
}

// ── Service Worker ────────────────────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  buildControls();
  document.getElementById('btn-random').addEventListener('click', randomise);
  document.getElementById('btn-dance').addEventListener('click', () => dance());
  randomise();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
