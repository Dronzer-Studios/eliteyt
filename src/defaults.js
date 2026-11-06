const EYT_DEFAULTS = {
  battery: true, onlyOnBattery: true, autoQuality: true, cap30: true, h264: false, noAmbient: true,
  speed: true, rememberSpeed: true, maxSpeed: 4, defaultSpeed: 1,
  musicSeparate: true, musicSpeed: 1, exempt: [], volume: 100, moveAudio: true,
  hideShorts: false, hideComments: false, hideRelated: false, hideEndCards: true, hideChat: false,
  adBlock: true, aiFilter: true, lowEffort: true, slopHide: false, slopStrict: false, slopAllow: [], slopBlock: [],
  sponsorBlock: true, sbSponsor: true, sbSelfpromo: true, sbInteraction: true, sbIntro: false, sbOutro: false,
  sbPreview: false, sbFiller: false, sbMusic: false, deArrow: true, daThumbs: true, ryd: true,
  homeShelves: true, topbar: true, calmThumbs: true, homeClean: true, homeCols: 4, homeNoShorts: true, homeNoAds: true,
  expLayout: true, descToPanel: true, stats: false, pauseInfo: true, pauseBlur: true, pauseTitle: true, titleInPlayer: true,
  layout: {
    side: 'right', width: 400, cols: 3, card: 'grid',
    main: ['player', 'channel', 'actions', 'recommendations'],
    sidebar: ['title', 'description', 'merch', 'comments'],
    hidden: ['chat']
  },
  // home page sections, top to bottom; 'recommended' is YouTube's own endless feed, so it always comes last
  homeLayout: { shown: ['hero', 'continue', 'subs', 'recommended'], hidden: [] },
  // narrow windows (one column), and theater mode when `theater` is on: one stacked list
  stackLayout: { order: ['player', 'title', 'channel', 'actions', 'description', 'comments', 'recommendations'], hidden: ['merch', 'chat'], theater: false },
  // other pages: grid columns and the sections that are hidden
  pageLayouts: { subs: { cols: 0, hide: [] }, search: { hide: [] }, channel: { cols: 0, hide: [] } }, // cols 0 = YouTube's choice
  profileKeys: true
};
