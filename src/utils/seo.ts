export interface RouteSeoMeta {
  title: string;
  description: string;
  keywords: string;
  ogImage: string;
  ogImageAlt: string;
  ogType?: 'website' | 'article';
  robots?: string;
  breadcrumbLabel?: string;
  gameSchema?: {
    name: string;
    genre: string[];
    description: string;
    playMode: string[];
  };
}

export const SITE_NAME = 'Aurelia Arena';
export const DEFAULT_OG_IMAGE = '/og/og-home.jpg';

const DEFAULT_SEO: RouteSeoMeta = {
  title: 'Aurelia Arena – 3D Teen Patti, Ludo, Dragon Tiger & Aviator',
  description:
    'Play ultra-realistic 3D Teen Patti, Ludo, Dragon Tiger, and Aviator right in your browser with real-time multiplayer, fair RNG, and daily rewards.',
  keywords:
    'Aurelia Arena, 3D Teen Patti, Ludo 3D online, Dragon Tiger 3D, Aviator 3D game, browser 3D card games, multiplayer Ludo India',
  ogImage: DEFAULT_OG_IMAGE,
  ogImageAlt: 'Aurelia Arena 3D Teen Patti, Ludo, Dragon Tiger and Aviator gaming platform',
  ogType: 'website',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
};

export const ROUTE_SEO_MAP: Record<string, RouteSeoMeta> = {
  '/': DEFAULT_SEO,
  '/games': {
    title: 'All 3D Games – Teen Patti, Ludo, Dragon Tiger | Aurelia Arena',
    description:
      'Explore all 3D multiplayer games on Aurelia Arena: Teen Patti 3D, Ludo 3D Quick & Classic, Asian Temple Dragon Tiger, and Aviator Ascent.',
    keywords:
      'Aurelia Arena games, 3D casino tabletop games, Teen Patti 3D, Ludo 3D, Dragon Tiger online, Aviator crash game',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena 3D Games Lobby',
    breadcrumbLabel: 'Games',
  },
  '/games/teen-patti': {
    title: 'Teen Patti 3D Online – Royal 3-Card Table | Aurelia Arena',
    description:
      'Play realistic 3D Teen Patti online with Blind & Chaal betting, Side Show, live 5-seat felt table, smooth 3D card dealing, and instant payouts.',
    keywords:
      'Teen Patti 3D, play Teen Patti online, 3 Patti card game, Blind Chaal Teen Patti, multiplayer Teen Patti browser',
    ogImage: '/og/og-teen-patti.jpg',
    ogImageAlt: 'Teen Patti 3D green velvet card table on Aurelia Arena',
    breadcrumbLabel: 'Teen Patti 3D',
    gameSchema: {
      name: 'Teen Patti 3D',
      genre: ['Card Game', 'Tabletop', 'Multiplayer'],
      description:
        'Classic Indian 3-card Teen Patti rendered in interactive 3D with Blind, Seen, Chaal, Side Show, and Showdown mechanics.',
      playMode: ['MultiPlayer', 'SinglePlayer'],
    },
  },
  '/games/ludo': {
    title: 'Ludo 3D Online – Quick & Classic Boards | Aurelia Arena',
    description:
      'Roll the dice in crisp 3D Ludo online! Play Quick 1-Token, Classic 4-Token, or Private Rooms with friends, 1v1 or 4-player tables, and provably fair dice.',
    keywords:
      'Ludo 3D online, Ludo multiplayer, Quick Ludo 1 token, Classic Ludo board game, play Ludo with friends',
    ogImage: '/og/og-ludo.jpg',
    ogImageAlt: 'Ludo 3D board game with four colorful home yards on Aurelia Arena',
    breadcrumbLabel: 'Ludo 3D',
    gameSchema: {
      name: 'Ludo 3D',
      genre: ['Board Game', 'Strategy', 'Multiplayer'],
      description:
        'High-definition 3D Ludo featuring 1v1 and 4-player tables, Quick 1-Token and Classic 4-Token rules, private rooms, and server-verified fair dice.',
      playMode: ['MultiPlayer', 'SinglePlayer'],
    },
  },
  '/games/dragon-tiger': {
    title: 'Dragon Tiger 3D – Asian Temple Card Battle | Aurelia Arena',
    description:
      'Experience fast-paced Dragon vs Tiger 3D card battles with 1:1 Dragon/Tiger & 8:1 Tie payouts, live trend beads, and authentic temple table visuals.',
    keywords:
      'Dragon Tiger 3D, Dragon vs Tiger card game, online Dragon Tiger, 8:1 Tie Dragon Tiger, live trend Dragon Tiger',
    ogImage: '/og/og-dragon-tiger.jpg',
    ogImageAlt: 'Dragon Tiger 3D Asian temple betting table on Aurelia Arena',
    breadcrumbLabel: 'Dragon Tiger 3D',
    gameSchema: {
      name: 'Dragon Tiger 3D',
      genre: ['Card Game', 'Arcade', 'Multiplayer'],
      description:
        'Fast high-card Asian temple Dragon vs Tiger showdown with live history beads, smooth chip tossing, and instant round resolution.',
      playMode: ['MultiPlayer', 'SinglePlayer'],
    },
  },
  '/games/aviator': {
    title: 'Aviator 3D Ascent – Live Flight Multiplier | Aurelia Arena',
    description:
      'Take off in 3D Aviator Ascent! Track the live rising multiplier, place dual bets, and cash out before the jet flies away with provably fair SHA-256 rounds.',
    keywords:
      'Aviator 3D game, Aviator multiplier online, crash flight game, provably fair Aviator, live cashout game',
    ogImage: '/og/og-aviator.jpg',
    ogImageAlt: 'Aviator 3D jet takeoff multiplier screen on Aurelia Arena',
    breadcrumbLabel: 'Aviator 3D',
    gameSchema: {
      name: 'Aviator Ascent 3D',
      genre: ['Arcade', 'Crash Game', 'Simulation'],
      description:
        'Cinematic 3D flight multiplier game with real-time cashout controls, auto-cashout targets, and SHA-256 provably fair crash verification.',
      playMode: ['MultiPlayer', 'SinglePlayer'],
    },
  },
  '/leaderboard': {
    title: 'Global Leaderboard – Top 3D Players | Aurelia Arena',
    description:
      'See the highest-ranked players across Teen Patti 3D, Ludo 3D, Dragon Tiger, and Aviator on the live Aurelia Arena global leaderboard.',
    keywords: 'Aurelia Arena leaderboard, top Ludo players, Teen Patti rankings, Dragon Tiger winners',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Global Player Leaderboard',
    breadcrumbLabel: 'Leaderboard',
  },
  '/rewards': {
    title: 'Daily Rewards, Bonuses & Missions | Aurelia Arena',
    description:
      'Claim daily streak bonuses, complete 3D game missions, and unlock extra playable rewards across Teen Patti, Ludo, Dragon Tiger, and Aviator.',
    keywords: 'Aurelia Arena rewards, daily login bonus, Ludo missions, Teen Patti bonus',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Daily Rewards and Missions',
    breadcrumbLabel: 'Rewards',
  },
  '/download-apk': {
    title: 'Install Aurelia Arena App – Android & Mobile PWA',
    description:
      'Install Aurelia Arena on Android or iOS for instant full-screen 3D Teen Patti, Ludo, Dragon Tiger, and Aviator with smooth mobile performance.',
    keywords: 'Aurelia Arena app, download Aurelia Arena Android, Ludo 3D mobile app, Teen Patti PWA',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Mobile App Install Guide',
    breadcrumbLabel: 'Download App',
  },
  '/rules': {
    title: 'Official Game Rules & How to Play | Aurelia Arena',
    description:
      'Read official rules, payouts, hand rankings, and fair-play guides for Teen Patti 3D, Ludo 3D, Dragon Tiger, and Aviator on Aurelia Arena.',
    keywords: 'Teen Patti rules, Ludo rules, Dragon Tiger payouts, Aviator how to play, Aurelia Arena rules',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Official Game Rules',
    breadcrumbLabel: 'Game Rules',
  },
  '/about': {
    title: 'About Aurelia Arena – Next-Gen 3D Browser Gaming',
    description:
      'Learn about Aurelia Arena, our PBR WebGL 3D game engine, server-verified fair play systems, and real-time multiplayer gaming architecture.',
    keywords: 'About Aurelia Arena, 3D WebGL gaming platform, fair play gaming',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'About Aurelia Arena',
    breadcrumbLabel: 'About Us',
  },
  '/fair-play': {
    title: 'Fair Play & Provably Fair RNG Policy | Aurelia Arena',
    description:
      'Verify how Aurelia Arena protects every Ludo dice roll, card deal, and Aviator crash point with server-authoritative cryptographic RNG.',
    keywords: 'provably fair RNG, fair play policy, server-side dice verification, Aurelia Arena fairness',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Fair Play and RNG Verification Policy',
    breadcrumbLabel: 'Fair Play',
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming (18+ Only) | Aurelia Arena',
    description:
      'Play responsibly on Aurelia Arena. Learn about our 18+ age policy, session balance tools, and healthy gaming practices.',
    keywords: 'responsible gaming, 18+ gaming policy, safe play Aurelia Arena',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Responsible Gaming Guidelines',
    breadcrumbLabel: 'Responsible Gaming',
  },
  '/contact': {
    title: 'Help & Support Center | Aurelia Arena',
    description:
      'Need help with your account, wallet, or game table? Reach Aurelia Arena player support or open a support ticket anytime.',
    keywords: 'Aurelia Arena support, contact Aurelia Arena, player help center',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Help and Support Center',
    breadcrumbLabel: 'Support',
  },
  '/support': {
    title: 'Help & Support Center | Aurelia Arena',
    description:
      'Need help with your account, wallet, or game table? Reach Aurelia Arena player support or open a support ticket anytime.',
    keywords: 'Aurelia Arena support, contact Aurelia Arena, player help center',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Help and Support Center',
    breadcrumbLabel: 'Support',
  },
  '/privacy': {
    title: 'Privacy Policy | Aurelia Arena',
    description:
      'Read the Aurelia Arena Privacy Policy detailing how we safeguard player account data, authentication, and gameplay telemetry.',
    keywords: 'Aurelia Arena privacy policy, data protection',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Privacy Policy',
    breadcrumbLabel: 'Privacy Policy',
  },
  '/terms': {
    title: 'Terms & Conditions | Aurelia Arena',
    description:
      'Review the Aurelia Arena Terms and Conditions covering user eligibility, fair play compliance, account rules, and platform guidelines.',
    keywords: 'Aurelia Arena terms and conditions, user agreement',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Terms and Conditions',
    breadcrumbLabel: 'Terms & Conditions',
  },
  // Private / authenticated user utility pages (excluded from search indexing)
  '/login': {
    title: 'Log In | Aurelia Arena',
    description: 'Sign in to your Aurelia Arena account to play 3D Teen Patti, Ludo, Dragon Tiger, and Aviator.',
    keywords: 'Aurelia Arena login, sign in',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Log In to Aurelia Arena',
    robots: 'noindex, nofollow',
  },
  '/register': {
    title: 'Create Account | Aurelia Arena',
    description: 'Create your Aurelia Arena account and start playing 3D Teen Patti, Ludo, Dragon Tiger, and Aviator.',
    keywords: 'Aurelia Arena register, sign up',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Create Account on Aurelia Arena',
    robots: 'noindex, nofollow',
  },
  '/profile': {
    title: 'Player Profile | Aurelia Arena',
    description: 'Manage your Aurelia Arena player profile, stats, and preferences.',
    keywords: 'Aurelia Arena profile',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Player Profile',
    robots: 'noindex, nofollow',
  },
  '/wallet': {
    title: 'Wallet | Aurelia Arena',
    description: 'View your Aurelia Arena wallet balance, bonus credits, and activity.',
    keywords: 'Aurelia Arena wallet',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Wallet',
    robots: 'noindex, nofollow',
  },
  '/transactions': {
    title: 'Transaction History | Aurelia Arena',
    description: 'Review your Aurelia Arena wallet ledger and round settlements.',
    keywords: 'Aurelia Arena transactions',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Transaction History',
    robots: 'noindex, nofollow',
  },
  '/history': {
    title: 'Game History | Aurelia Arena',
    description: 'Inspect your recent Teen Patti, Ludo, Dragon Tiger, and Aviator match results.',
    keywords: 'Aurelia Arena game history',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Game History',
    robots: 'noindex, nofollow',
  },
  '/admin': {
    title: 'Admin Dashboard | Aurelia Arena',
    description: 'Aurelia Arena platform administration.',
    keywords: 'Aurelia Arena admin',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: 'Aurelia Arena Admin Dashboard',
    robots: 'noindex, nofollow',
  },
};

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertRouteJsonLd(pathname: string, origin: string, meta: RouteSeoMeta) {
  const scriptId = 'aurelia-route-jsonld';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;

  const graph: Record<string, unknown>[] = [];
  const canonicalUrl = `${origin}${pathname === '/' ? '/' : pathname}`;
  const ogImageUrl = `${origin}${meta.ogImage}`;

  // BreadcrumbList for all public subpages
  if (pathname !== '/' && meta.breadcrumbLabel && meta.robots !== 'noindex, nofollow') {
    const items: Array<Record<string, unknown>> = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
    ];
    if (pathname.startsWith('/games/')) {
      items.push({ '@type': 'ListItem', position: 2, name: 'Games', item: `${origin}/games` });
      items.push({ '@type': 'ListItem', position: 3, name: meta.breadcrumbLabel, item: canonicalUrl });
    } else {
      items.push({ '@type': 'ListItem', position: 2, name: meta.breadcrumbLabel, item: canonicalUrl });
    }
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: items,
    });
  }

  // VideoGame rich schema on each game route
  if (meta.gameSchema) {
    graph.push({
      '@type': 'VideoGame',
      name: meta.gameSchema.name,
      url: canonicalUrl,
      image: ogImageUrl,
      description: meta.gameSchema.description,
      genre: meta.gameSchema.genre,
      playMode: meta.gameSchema.playMode,
      gamePlatform: ['Web Browser', 'Android', 'iOS'],
      applicationCategory: 'GameApplication',
      operatingSystem: 'All',
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${origin}/`,
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
    });
  }

  if (pathname === '/games') {
    graph.push({
      '@type': 'CollectionPage',
      name: 'Aurelia Arena 3D Games',
      url: canonicalUrl,
      description: meta.description,
    });
  }

  if (graph.length === 0) {
    script?.remove();
    return;
  }

  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

export function applyRouteSeo(pathname: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const normalizedPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const meta = ROUTE_SEO_MAP[normalizedPath] || DEFAULT_SEO;
  const origin = window.location.origin;
  const canonicalUrl = `${origin}${normalizedPath === '/' ? '/' : normalizedPath}`;
  const ogImageUrl = `${origin}${meta.ogImage}`;
  const robots = meta.robots || DEFAULT_SEO.robots!;

  document.title = meta.title;

  upsertMeta('name', 'description', meta.description);
  upsertMeta('name', 'keywords', meta.keywords);
  upsertMeta('name', 'robots', robots);
  upsertLink('canonical', canonicalUrl);

  // OpenGraph social share cards
  upsertMeta('property', 'og:type', meta.ogType || 'website');
  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:locale', 'en_IN');
  upsertMeta('property', 'og:url', canonicalUrl);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:image', ogImageUrl);
  upsertMeta('property', 'og:image:alt', meta.ogImageAlt);

  // Twitter / X cards
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', meta.title);
  upsertMeta('name', 'twitter:description', meta.description);
  upsertMeta('name', 'twitter:image', ogImageUrl);
  upsertMeta('name', 'twitter:image:alt', meta.ogImageAlt);

  upsertRouteJsonLd(normalizedPath, origin, meta);
}
