/* ============================================================
   icons.js — Bibliothèque d'icônes SVG monochromes (style lucide)
   ============================================================
   - remplace tous les <span data-icon="xxx"> au chargement
   - remplace tous les émojis visibles dans la page par leurs SVG
   - surveille les changements DOM pour faire pareil sur les
     contenus injectés dynamiquement.
   Inclure simplement <script src="/icons.js"></script>.
   ============================================================ */

(function () {
  // ─── Bibliothèque d'icônes (24x24 viewBox, stroke="currentColor") ──
  const ICONS = {
    dashboard:    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    home:         '<path d="M3 12L12 3l9 9"/><path d="M5 10v10h14V10"/>',
    grid:         '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    monitor:      '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    list:         '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    filter:       '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    layers:       '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    users:        '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    user:         '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    user_check:   '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
    user_plus:    '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    user_x:       '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>',
    calendar:     '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    clock:        '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    timer:        '<circle cx="12" cy="14" r="8"/><polyline points="12 10 12 14 14 16"/><path d="M9 2h6"/>',
    sun:          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon:         '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    sunset:       '<path d="M17 18a5 5 0 00-10 0M12 9V2M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1"/>',
    sunrise:      '<path d="M17 18a5 5 0 00-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1"/>',
    message:      '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
    chat_bubble:  '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
    bell:         '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
    bell_off:     '<path d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.89 17.89 0 0118 8M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14M18 8a6 6 0 00-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>',
    broadcast:    '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49M7.76 16.24a6 6 0 010-8.49M20.49 4.51a10 10 0 010 14.98M4.51 19.49A10 10 0 014.51 4.51"/>',
    speaker:      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>',
    mail:         '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
    phone:        '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>',
    smartphone:   '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    chart:        '<path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 21 6"/>',
    chart_bar:    '<path d="M3 3v18h18"/><rect x="7" y="13" width="3" height="5"/><rect x="12" y="9" width="3" height="9"/><rect x="17" y="5" width="3" height="13"/>',
    chart_pie:    '<path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/>',
    trend_up:     '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    trend_down:   '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    file_text:    '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    folder:       '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
    folder_plus:  '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    archive:      '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    credit_card:  '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    dollar:       '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    euro:         '<path d="M4 10h12M4 14h9M19 6.71a6.5 6.5 0 100 10.58"/>',
    wallet:       '<path d="M20 12V8H6a2 2 0 010-4h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 100 4h4v-4z"/>',
    receipt:      '<path d="M4 2v20l4-2 4 2 4-2 4 2V2H4z"/><path d="M8 7h8M8 11h8M8 15h6"/>',
    coins:        '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1110.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
    piggy_bank:   '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2h0V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h0"/>',
    mic:          '<path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/>',
    mic_off:      '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/>',
    headphones:   '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>',
    play:         '<polygon points="5 3 19 12 5 21 5 3"/>',
    pause:        '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    stop:         '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    skip_forward: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
    skip_back:    '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
    volume:       '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/>',
    volume_x:     '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    alert:        '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    alert_circle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    alert_octagon:'<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    shield:       '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shield_check: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    shield_off:   '<path d="M19.69 14a6.9 6.9 0 00.31-2V5l-8-3-3.16 1.18M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 005.62-4.38"/><line x1="1" y1="1" x2="23" y2="23"/>',
    eye:          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eye_off:      '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    circle_dot:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    no_entry:     '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    block:        '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    construction: '<rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7M7 14v7M17 3v3M7 3v3M10 14v.01M14 14v.01M10 18v.01M14 18v.01"/>',
    settings:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    tool:         '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
    fullscreen:   '<path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/>',
    minimize:     '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    clipboard:    '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    log_out:      '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    log_in:       '<path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    power:        '<path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/>',
    refresh:      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
    crown:        '<path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>',
    chef_hat:     '<path d="M6 22h12M5 17h14M6 17a4 4 0 010-8 4 4 0 015-3.87A4 4 0 0118 9a4 4 0 010 8"/>',
    cocktail:     '<path d="M8 21h8M12 15v6M5 3h14l-7 12L5 3z"/>',
    plate:        '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
    briefcase:    '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
    user_star:    '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polygon points="20 3 21.5 6 24.5 6.5 22.25 8.75 23 12 20 10.5 17 12 17.75 8.75 15.5 6.5 18.5 6"/>',
    award:        '<circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    trophy:       '<path d="M6 9H4a2 2 0 01-2-2V5h4M18 9h2a2 2 0 002-2V5h-4M6 22h12M12 17v5M6 5h12v6a6 6 0 11-12 0V5z"/>',
    plus:         '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    plus_circle:  '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    minus:        '<line x1="5" y1="12" x2="19" y2="12"/>',
    edit:         '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    pen:          '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
    trash:        '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>',
    save:         '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    check:        '<polyline points="20 6 9 17 4 12"/>',
    check_circle: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    x:            '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    x_circle:     '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    download:     '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload:       '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    search:       '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    copy:         '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    link:         '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
    external:     '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    send:         '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    box:          '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    package:      '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>',
    map_pin:      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    map:          '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    book:         '<path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    book_open:    '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
    star:         '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>',
    coffee:       '<path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
    utensils:     '<path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 002-2V2M7 2v20M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3z"/>',
    pizza:        '<path d="M15 11h.01M11 15h.01M16 16h.01M2 16l20 6-6-20A20 20 0 002 16M5.71 17.11a17.04 17.04 0 0111.4-11.4"/>',
    burger:       '<path d="M2 13h20a2 2 0 010 4H2zM2 7c0-2 2-4 5-4h10c3 0 5 2 5 4M3 17v1a3 3 0 003 3h12a3 3 0 003-3v-1"/>',
    wine:         '<path d="M8 2h8M8 2v6a4 4 0 008 0V2M12 12v8M9 20h6"/>',
    beer:         '<path d="M5 3h10v18a2 2 0 01-2 2H7a2 2 0 01-2-2zM15 7h2a2 2 0 012 2v6a2 2 0 01-2 2h-2"/>',
    cake:         '<path d="M12 2l1.5 3M3 21h18M3 21V11a2 2 0 012-2h14a2 2 0 012 2v10M3 14a3 3 0 003-3 3 3 0 003 3 3 3 0 003-3 3 3 0 003 3 3 3 0 003-3 3 3 0 003 3"/>',
    cookie:       '<path d="M12 2a10 10 0 100 20 10 10 0 005-18.66"/><circle cx="8" cy="9" r="1"/><circle cx="13" cy="14" r="1"/><circle cx="16" cy="9" r="1"/>',
    salad:        '<path d="M7 21h10M12 21V11M2 11h20a8 8 0 01-16 0z"/>',
    fish:         '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6 2.54 6 6s-2.44 6-6 6c-3.56 0-7.56-2.54-8.5-6z"/><path d="M2 12s1-2 4-2M18 12h.01"/>',
    egg:          '<path d="M12 22c-4.97 0-9-4.03-9-9 0-5 3-12 9-12s9 7 9 12c0 4.97-4.03 9-9 9z"/>',
    apple:        '<path d="M12 6c-2.5-3-7 0-7 3.5 0 5 7 11 7 11s7-6 7-11c0-3.5-4.5-6.5-7-3.5z"/>',
    bread:        '<path d="M3 12c0-3 3-6 9-6s9 3 9 6c0 1.5-1 3-3 3v3a3 3 0 01-3 3h-6a3 3 0 01-3-3v-3c-2 0-3-1.5-3-3z"/>',
    car:          '<path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    bike:         '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 100-2 1 1 0 000 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>',
    cart:         '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>',
    storefront:   '<path d="M3 9V21h18V9M3 9l3-6h12l3 6M3 9h18M9 14h6"/>',
    building:     '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
    factory:      '<path d="M2 20a2 2 0 002 2h16a2 2 0 002-2V8l-7 5V8l-7 5V4a2 2 0 00-2-2H4a2 2 0 00-2 2zM17 18h1M12 18h1M7 18h1"/>',
    sparkles:     '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM18 18l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
    flame:        '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>',
    globe:        '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',
    rocket:       '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    target:       '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    pin:          '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 002-2V3H6v1a2 2 0 002 2h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>',
    palette:      '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01a1.49 1.49 0 01-.39-1.01c0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.5-9-10-9z"/>',
    party:        '<path d="M5.8 11.3L2 22l10.7-3.79M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2L11 13M11 2L6 7l5 5"/>',
    gift:         '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7z"/>',
    rotate_left:  '<path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0M9 12l3-3 3 3M12 9v6"/>',
    rotate_right: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>',
    arrow_up:     '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    arrow_down:   '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    arrow_left:   '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    arrow_right:  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    chevron_up:   '<polyline points="18 15 12 9 6 15"/>',
    chevron_down: '<polyline points="6 9 12 15 18 9"/>',
    lock:         '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    unlock:       '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>',
    key:          '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    info:         '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    help:         '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>',
    zap:          '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    activity:     '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    cpu:          '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    database:     '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    server:       '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    flag:         '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    bookmark:     '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
    image:        '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    camera:       '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
    video:        '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    tv:           '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>',
    print:        '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    smile:        '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    frown:        '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    meh:          '<circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    thumb_up:     '<path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>',
    thumb_down:   '<path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zM17 2h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"/>',
    heart:        '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>',
    bolt:         '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    music:        '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    wand:         '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
    badge:        '<path d="M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76z"/><polyline points="9 12 11 14 15 10"/>'
  };

  // ─── Mappage émoji → icône SVG ─────────────────────────────
  const EMOJI_TO_ICON = {
    // Rôles & personnes
    '\u{1F451}': 'crown', '\u{1F454}': 'briefcase', '\u{1F37D}️': 'plate', '\u{1F37D}': 'plate',
    '\u{1F373}': 'chef_hat', '\u{1F379}': 'cocktail',
    '\u{1F464}': 'user', '\u{1F465}': 'users', '\u{1F9D1}': 'user', '\u{1F468}': 'user', '\u{1F469}': 'user',
    '\u{1F935}': 'briefcase', '\u{1F4BC}': 'briefcase',
    '\u{1F3C6}': 'trophy', '\u{1F947}': 'trophy', '\u{1F948}': 'award', '\u{1F949}': 'award', '\u{1F396}️': 'award', '\u{1F396}': 'award',

    // Calendrier / temps
    '\u{1F4C5}': 'calendar', '\u{1F4C6}': 'calendar', '\u{1F5D3}️': 'calendar', '\u{1F5D3}': 'calendar',
    '\u{1F550}': 'clock', '\u{1F551}': 'clock', '\u{1F552}': 'clock', '\u{1F553}': 'clock', '\u{1F554}': 'clock',
    '\u{1F555}': 'clock', '\u{1F556}': 'clock', '\u{1F557}': 'clock', '\u{1F558}': 'clock', '\u{1F559}': 'clock',
    '\u{1F55A}': 'clock', '\u{1F55B}': 'clock', '⏰': 'clock', '⏲️': 'timer', '⏱️': 'timer',
    '⏱': 'timer', '⏲': 'timer', '⌛': 'timer', '⏳': 'timer',
    '\u{1F305}': 'sunrise', '\u{1F304}': 'sunrise', '\u{1F306}': 'sunset', '\u{1F307}': 'sunset',
    '☀️': 'sun', '☀': 'sun', '\u{1F31E}': 'sun', '\u{1F319}': 'moon', '\u{1F31A}': 'moon', '\u{1F31C}': 'moon', '\u{1F31B}': 'moon',

    // Communication
    '\u{1F4AC}': 'chat_bubble', '\u{1F5E8}️': 'chat_bubble', '\u{1F5E8}': 'chat_bubble', '\u{1F4AD}': 'chat_bubble',
    '\u{1F4E8}': 'mail', '✉️': 'mail', '✉': 'mail', '\u{1F4E7}': 'mail', '\u{1F4E9}': 'mail', '\u{1F4EA}': 'mail', '\u{1F4EB}': 'mail', '\u{1F4EC}': 'mail', '\u{1F4ED}': 'mail',
    '\u{1F514}': 'bell', '\u{1F515}': 'bell_off', '\u{1F4E2}': 'broadcast', '\u{1F4E3}': 'broadcast', '\u{1F4EF}': 'broadcast',
    '\u{1F3A4}': 'mic', '\u{1F399}️': 'mic', '\u{1F399}': 'mic', '\u{1F3A7}': 'headphones',
    '\u{1F4DE}': 'phone', '☎️': 'phone', '☎': 'phone', '\u{1F4F1}': 'smartphone',

    // Analyse / data
    '\u{1F4CA}': 'chart_bar', '\u{1F4C8}': 'trend_up', '\u{1F4C9}': 'trend_down',
    '\u{1F4CB}': 'clipboard', '\u{1F4D1}': 'receipt',
    '\u{1F4C4}': 'file_text', '\u{1F4C3}': 'file_text', '\u{1F4DC}': 'file_text', '\u{1F4F0}': 'file_text',
    '\u{1F4C2}': 'folder', '\u{1F4C1}': 'folder', '\u{1F5C2}️': 'folder', '\u{1F5C2}': 'folder',
    '\u{1F5C3}️': 'archive', '\u{1F5C3}': 'archive', '\u{1F5C4}️': 'archive', '\u{1F5C4}': 'archive',

    // Argent
    '\u{1F4B3}': 'credit_card', '\u{1F4B0}': 'wallet', '\u{1F4B5}': 'dollar', '\u{1F4B4}': 'wallet', '\u{1F4B6}': 'euro', '\u{1F4B7}': 'wallet',
    '\u{1FA99}': 'coins', '\u{1F437}': 'piggy_bank', '\u{1F416}': 'piggy_bank',
    '\u{1F4B8}': 'wallet', '\u{1F9FE}': 'receipt',

    // Statut / alertes
    '⚠️': 'alert', '⚠': 'alert', '\u{1F6A8}': 'alert_octagon', '⛔': 'no_entry', '\u{1F6AB}': 'no_entry', '❌': 'x', '❎': 'x_circle',
    '\u{1F6E1}️': 'shield', '\u{1F6E1}': 'shield', '\u{1F512}': 'lock', '\u{1F513}': 'unlock', '\u{1F510}': 'lock', '\u{1F5DD}️': 'key', '\u{1F5DD}': 'key', '\u{1F511}': 'key',
    '\u{1F441}️': 'eye', '\u{1F441}': 'eye', '\u{1F440}': 'eye', '\u{1F6A7}': 'construction',
    '✅': 'check_circle', '✔️': 'check', '✔': 'check', '☑️': 'check', '☑': 'check',
    '\u{1F50D}': 'search', '\u{1F50E}': 'search', 'ℹ️': 'info', 'ℹ': 'info', '❓': 'help', '❔': 'help', '❗': 'alert_circle', '❕': 'alert_circle',

    // Système
    '⚙️': 'settings', '⚙': 'settings', '\u{1F527}': 'tool', '\u{1F528}': 'tool', '\u{1F6E0}️': 'tool', '\u{1F6E0}': 'tool',
    '\u{1F6AA}': 'log_out',
    '\u{1F3E0}': 'home', '\u{1F3E1}': 'home', '\u{1F3EA}': 'storefront', '\u{1F3EC}': 'storefront', '\u{1F3E2}': 'building', '\u{1F3E3}': 'building', '\u{1F3ED}': 'factory',
    '✏️': 'edit', '✏': 'edit', '\u{1F58A}️': 'pen', '\u{1F58A}': 'pen', '\u{1F58B}️': 'pen', '\u{1F58B}': 'pen', '\u{1F58D}️': 'pen', '\u{1F58D}': 'pen',
    '\u{1F5D1}️': 'trash', '\u{1F5D1}': 'trash',
    '➕': 'plus', '➖': 'minus',
    '\u{1F4BE}': 'save', '⬇️': 'download', '⬇': 'download', '⬆️': 'upload', '⬆': 'upload',
    '\u{1F504}': 'refresh', '\u{1F503}': 'refresh', '\u{1F501}': 'rotate_right', '\u{1F502}': 'rotate_right',
    '↩️': 'rotate_left', '↩': 'rotate_left', '↪️': 'rotate_right', '↪': 'rotate_right',
    '⬅️': 'arrow_left', '⬅': 'arrow_left', '➡️': 'arrow_right', '➡': 'arrow_right',
    '\u{1F53C}': 'chevron_up', '\u{1F53D}': 'chevron_down',

    // Domaine métier
    '\u{1F4E6}': 'box', '\u{1F381}': 'gift',
    '⭐': 'star', '\u{1F31F}': 'sparkles', '✨': 'sparkles', '\u{1F4AB}': 'sparkles', '\u{1FA84}': 'wand',
    '\u{1F525}': 'flame', '\u{1F4A5}': 'bolt', '⚡': 'zap', '⚡️': 'zap',
    '\u{1F30D}': 'globe', '\u{1F310}': 'globe', '\u{1F30E}': 'globe', '\u{1F30F}': 'globe',
    '\u{1F4CD}': 'map_pin', '\u{1F5FA}️': 'map', '\u{1F5FA}': 'map',
    '\u{1F4DA}': 'book', '\u{1F4D6}': 'book_open', '\u{1F4D2}': 'book', '\u{1F4D3}': 'book', '\u{1F4D4}': 'book', '\u{1F4D5}': 'book', '\u{1F4D7}': 'book', '\u{1F4D8}': 'book', '\u{1F4D9}': 'book',
    '☕': 'coffee', '\u{1F375}': 'coffee',
    '\u{1F374}': 'utensils', '\u{1F944}': 'utensils', '\u{1F376}': 'wine',
    '\u{1F354}': 'burger', '\u{1F355}': 'pizza', '\u{1F377}': 'wine', '\u{1F37A}': 'beer', '\u{1F37B}': 'beer', '\u{1F942}': 'wine', '\u{1F943}': 'wine',
    '\u{1F382}': 'cake', '\u{1F9C1}': 'cake', '\u{1F370}': 'cake', '\u{1F369}': 'cookie', '\u{1F36A}': 'cookie',
    '\u{1F957}': 'salad', '\u{1F41F}': 'fish', '\u{1F363}': 'fish', '\u{1F364}': 'fish', '\u{1F420}': 'fish',
    '\u{1F95A}': 'egg', '\u{1F34E}': 'apple', '\u{1F34F}': 'apple', '\u{1F956}': 'bread', '\u{1F950}': 'bread', '\u{1F35E}': 'bread',
    '\u{1F697}': 'car', '\u{1F699}': 'car', '\u{1F6F5}': 'bike', '\u{1F6F4}': 'bike', '\u{1F6B2}': 'bike',
    '\u{1F6D2}': 'cart', '\u{1F6CD}️': 'cart', '\u{1F6CD}': 'cart',

    // Médias
    '\u{1F4FA}': 'tv', '\u{1F4BB}': 'monitor', '\u{1F5A5}️': 'monitor', '\u{1F5A5}': 'monitor', '\u{1F5A8}️': 'print', '\u{1F5A8}': 'print',
    '\u{1F4F7}': 'camera', '\u{1F4F8}': 'camera', '\u{1F3A5}': 'video', '\u{1F4F9}': 'video',
    '\u{1F5BC}️': 'image', '\u{1F5BC}': 'image',
    '▶️': 'play', '▶': 'play', '⏸️': 'pause', '⏸': 'pause', '⏹️': 'stop', '⏹': 'stop',
    '⏭️': 'skip_forward', '⏭': 'skip_forward', '⏮️': 'skip_back', '⏮': 'skip_back',
    '\u{1F50A}': 'volume', '\u{1F509}': 'volume', '\u{1F508}': 'volume', '\u{1F507}': 'volume_x',
    '\u{1F3B5}': 'music', '\u{1F3B6}': 'music', '\u{1F3BC}': 'music',

    // Cibles, marqueurs
    '\u{1F3AF}': 'target', '\u{1F680}': 'rocket', '\u{1F4CC}': 'pin', '\u{1F4CE}': 'pin', '\u{1F3F7}️': 'pin', '\u{1F3F7}': 'pin',
    '\u{1F6A9}': 'flag', '\u{1F3C1}': 'flag', '\u{1F516}': 'bookmark',

    // Émotions / réactions
    '\u{1F642}': 'smile', '\u{1F600}': 'smile', '\u{1F603}': 'smile', '\u{1F604}': 'smile', '\u{1F60A}': 'smile', '\u{1F60E}': 'smile',
    '\u{1F641}': 'frown', '\u{1F61E}': 'frown', '\u{1F622}': 'frown', '\u{1F62D}': 'frown', '\u{1F614}': 'frown',
    '\u{1F610}': 'meh', '\u{1F636}': 'meh', '\u{1F914}': 'meh',
    '\u{1F44D}': 'thumb_up', '\u{1F44E}': 'thumb_down',
    '❤️': 'heart', '❤': 'heart', '\u{1F49B}': 'heart', '\u{1F49A}': 'heart', '\u{1F499}': 'heart', '\u{1F49C}': 'heart', '\u{1F9E1}': 'heart', '\u{1F90D}': 'heart', '\u{1F5A4}': 'heart',
    '\u{1F389}': 'party', '\u{1F38A}': 'party',

    // Pastilles colorées
    '\u{1F534}': 'circle_dot', '\u{1F7E2}': 'circle_dot', '\u{1F7E1}': 'circle_dot', '\u{1F535}': 'circle_dot',
    '\u{1F7E0}': 'circle_dot', '\u{1F7E3}': 'circle_dot', '⚫': 'circle_dot', '⚪': 'circle_dot',
    '\u{1F7E4}': 'circle_dot', '\u{1F7E5}': 'circle_dot', '\u{1F7E7}': 'circle_dot', '\u{1F7E8}': 'circle_dot',
    '\u{1F7E9}': 'circle_dot', '\u{1F7E6}': 'circle_dot', '\u{1F7EA}': 'circle_dot',

    // Caractères texte
    '✓': 'check', '✗': 'x', '✘': 'x', '✕': 'x', '×': 'x', '✖': 'x', '✖️': 'x',
    '◯': 'circle_dot', '○': 'circle_dot', '●': 'circle_dot', '◉': 'circle_dot',
    '★': 'star', '☆': 'star',

    // Petits "diamants" et formes décoratives
    '\u{1F538}': 'circle_dot', '\u{1F539}': 'circle_dot', '\u{1F536}': 'circle_dot', '\u{1F537}': 'circle_dot',
    '\u{1F53A}': 'chevron_up', '\u{1F53B}': 'chevron_down',
    '◆': 'circle_dot', '◇': 'circle_dot', '■': 'circle_dot', '□': 'circle_dot',

    // Activités étendues
    '\u{1F3AC}': 'video', '\u{1F39E}️': 'video', '\u{1F39E}': 'video', '\u{1F3AB}': 'pin', '\u{1F39F}️': 'pin', '\u{1F39F}': 'pin',
    '\u{1FA91}': 'building', '\u{1FA9F}': 'building',
    '\u{1F6CB}️': 'building', '\u{1F6CB}': 'building', '\u{1F6CF}️': 'building', '\u{1F6CF}': 'building',
    '\u{1F6BF}': 'tool', '\u{1F6C1}': 'tool',
    '\u{1F334}': 'sun', '\u{1F333}': 'sun', '\u{1F332}': 'sun', '\u{1F331}': 'salad', '\u{1F33F}': 'salad', '\u{1F340}': 'salad', '\u{1F343}': 'salad',
    '\u{1F3D6}️': 'sun', '\u{1F3D6}': 'sun', '\u{1F3DD}️': 'sun', '\u{1F3DD}': 'sun', '\u{1F3DC}️': 'sun', '\u{1F3DC}': 'sun',
    '\u{1F912}': 'alert_circle', '\u{1F927}': 'alert_circle', '\u{1F637}': 'alert_circle', '\u{1F915}': 'alert_circle', '\u{1F922}': 'alert_circle',
    '\u{1F916}': 'cpu',
    '\u{1F9DE}': 'sparkles', '\u{1F9D9}': 'wand', '\u{1F9DA}': 'sparkles',

    // Boissons / nourriture étendue
    '\u{1F964}': 'wine', '\u{1F9CB}': 'wine', '\u{1F9C9}': 'wine', '\u{1F95B}': 'wine',
    '\u{1FAD9}': 'box', '\u{1F96B}': 'box', '\u{1F36F}': 'box',
    '\u{1F35F}': 'utensils', '\u{1F968}': 'bread', '\u{1F96F}': 'bread', '\u{1FAD3}': 'bread',
    '\u{1F9C0}': 'utensils', '\u{1F953}': 'utensils', '\u{1F95E}': 'cake', '\u{1F9C7}': 'cake',
    '\u{1F95F}': 'utensils', '\u{1F960}': 'utensils', '\u{1F362}': 'utensils', '\u{1F361}': 'utensils',
    '\u{1F96A}': 'burger', '\u{1F959}': 'burger', '\u{1F961}': 'box', '\u{1F9C6}': 'utensils',
    '\u{1F35D}': 'utensils', '\u{1F35C}': 'utensils', '\u{1F35F}': 'utensils', '\u{1F361}': 'utensils',
    '\u{1F35A}': 'utensils', '\u{1F35B}': 'utensils', '\u{1F359}': 'utensils', '\u{1F358}': 'utensils',
    '\u{1F356}': 'utensils', '\u{1F357}': 'utensils', '\u{1F32D}': 'utensils', '\u{1F32E}': 'utensils', '\u{1F32F}': 'utensils',
    '\u{1F35C}': 'utensils', '\u{1F372}': 'utensils', '\u{1F371}': 'utensils', '\u{1F35E}': 'bread',

    // Émotions étendues
    '\u{1F61F}': 'frown', '\u{1F615}': 'frown', '\u{1F623}': 'frown', '\u{1F616}': 'frown',
    '\u{1F629}': 'frown', '\u{1F62B}': 'frown', '\u{1F624}': 'frown',
    '\u{1F609}': 'smile', '\u{1F60B}': 'smile', '\u{1F929}': 'smile', '\u{1F973}': 'smile',
    '\u{1F60F}': 'meh', '\u{1F612}': 'meh',

    // Cloches / divers
    '\u{1F6CE}️': 'bell', '\u{1F6CE}': 'bell',
    '\u{1F4F2}': 'smartphone', '\u{1F4F4}': 'smartphone', '\u{1F4F3}': 'smartphone',
    '\u{1F52D}': 'eye', '\u{1F52C}': 'eye',
    '\u{1FA9E}': 'eye', '\u{1F6A6}': 'circle_dot', '\u{1F6A5}': 'circle_dot',
    '⛳': 'flag', '\u{1F3F3}️': 'flag', '\u{1F3F4}': 'flag', '\u{1F3F3}': 'flag',
    '\u{1FAA7}': 'flag',

    // Cadeau / divers
    '\u{1F3A8}': 'palette', '\u{1F3AE}': 'cpu', '\u{1F3B2}': 'cpu', '\u{1F9E9}': 'grid',
    '\u{1F9E0}': 'cpu', '\u{1F9EA}': 'eye',

    // Glace / desserts
    '\u{1F366}': 'cake', '\u{1F368}': 'cake', '\u{1F367}': 'cake',

    // Manquants courants
    '\u{1F4A1}': 'sparkles',
    '\u{1F517}': 'link',
    '\u{1F522}': 'list',
    '\u{1F9F9}': 'tool',
    '\u{1F6BB}': 'user',
    '\u{1FA9C}': 'tool',
    '\u{1F33E}': 'salad',
    '\u{1F3A3}': 'target',
    '\u{1F3C3}': 'user',
    '\u{1F3CB}️': 'user', '\u{1F3CB}': 'user',
    '\u{1F3CD}️': 'bike', '\u{1F3CD}': 'bike',
    '\u{1F3CE}️': 'car',  '\u{1F3CE}': 'car',

    // Drapeaux pays
    '\u{1F1EB}\u{1F1F7}': 'flag',
    '\u{1F1EC}\u{1F1E7}': 'flag',
    '\u{1F1FA}\u{1F1F8}': 'flag',
    '\u{1F1E9}\u{1F1EA}': 'flag',
    '\u{1F1EA}\u{1F1F8}': 'flag',
    '\u{1F1EE}\u{1F1F9}': 'flag',
    '\u{1F1F5}\u{1F1F9}': 'flag',
    '\u{1F1E7}\u{1F1EA}': 'flag',
    '\u{1F1F3}\u{1F1F1}': 'flag',
    '\u{1F1E8}\u{1F1ED}': 'flag',
    '\u{1F1EF}\u{1F1F5}': 'flag',
    '\u{1F1E8}\u{1F1F3}': 'flag',
    '\u{1F1F0}\u{1F1F7}': 'flag',
    '\u{1F1E6}\u{1F1FA}': 'flag',
    '\u{1F1E8}\u{1F1E6}': 'flag',
    '\u{1F1F2}\u{1F1FD}': 'flag',
    '\u{1F1E7}\u{1F1F7}': 'flag',
    '\u{1F1E6}\u{1F1F7}': 'flag',
    '\u{1F1F7}\u{1F1FA}': 'flag',
    '\u{1F1EE}\u{1F1F3}': 'flag'
  };

  // Construit une regex robuste qui matche tous les émojis
  let _emojiRegex = null;
  function buildRegex() {
    if (_emojiRegex) return _emojiRegex;
    const keys = Object.keys(EMOJI_TO_ICON).sort((a, b) => b.length - a.length);
    const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    _emojiRegex = new RegExp('(' + escaped.join('|') + ')', 'g');
    return _emojiRegex;
  }

  function ICON(name, opts) {
    opts = opts || {};
    const size = opts.size || 18;
    const stroke = opts.color || 'currentColor';
    const sw = opts.strokeWidth || 1.8;
    const inner = ICONS[name];
    if (!inner) return '<span style="display:inline-block;width:' + size + 'px"></span>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" ' +
      'style="display:inline-block;vertical-align:-3px;flex-shrink:0">' + inner + '</svg>';
  }

  function replaceAll(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      if (el.dataset.iconReplaced === '1') return;
      const name = el.getAttribute('data-icon');
      const size = parseInt(el.getAttribute('data-size') || '16', 10);
      const color = el.getAttribute('data-color');
      el.innerHTML = ICON(name, { size: size, color: color });
      el.dataset.iconReplaced = '1';
    });
  }

  const SKIP_TAGS = new Set(['SCRIPT','STYLE','CODE','PRE','TEXTAREA','INPUT','SELECT','OPTION','NOSCRIPT','SVG','TEMPLATE','TITLE']);

  function shouldSkip(node) {
    let p = node.parentNode;
    while (p && p.nodeType === 1) {
      if (SKIP_TAGS.has(p.tagName)) return true;
      if (p.classList && p.classList.contains('no-icon-replace')) return true;
      p = p.parentNode;
    }
    return false;
  }

  function replaceEmojisInElement(root) {
    if (!root) return;
    const re = buildRegex();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue) continue;
      re.lastIndex = 0;
      if (!re.test(node.nodeValue)) continue;
      re.lastIndex = 0;
      if (shouldSkip(node)) continue;
      targets.push(node);
    }
    targets.forEach(function (n) {
      const parent = n.parentNode;
      if (!parent) return;
      const txt = n.nodeValue;
      const re2 = buildRegex();
      re2.lastIndex = 0;
      let lastIdx = 0;
      const frag = document.createDocumentFragment();
      let m;
      while ((m = re2.exec(txt)) !== null) {
        if (m.index > lastIdx) frag.appendChild(document.createTextNode(txt.slice(lastIdx, m.index)));
        const iconName = EMOJI_TO_ICON[m[0]];
        const span = document.createElement('span');
        span.className = 'icon-emoji';
        span.style.display = 'inline-block';
        span.innerHTML = ICON(iconName, { size: 16 });
        frag.appendChild(span);
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < txt.length) frag.appendChild(document.createTextNode(txt.slice(lastIdx)));
      parent.replaceChild(frag, n);
    });
  }

  function replaceEmojisGlobal() {
    if (document.body) replaceEmojisInElement(document.body);
  }

  // ─── MutationObserver pour le contenu injecté dynamiquement ──
  let _observer = null;
  let _scheduledNodes = new Set();
  let _flushTimer = null;
  function scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(function () {
      _flushTimer = null;
      const nodes = Array.from(_scheduledNodes);
      _scheduledNodes.clear();
      nodes.forEach(function (n) {
        if (n && n.isConnected) {
          try { replaceAll(n); } catch (e) {}
          try { replaceEmojisInElement(n); } catch (e) {}
        }
      });
    }, 60);
  }
  function startObserver() {
    if (_observer || !document.body) return;
    _observer = new MutationObserver(function (records) {
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (rec.type === 'childList') {
          rec.addedNodes.forEach(function (n) {
            if (n.nodeType === 1) _scheduledNodes.add(n);
            else if (n.nodeType === 3 && n.parentNode) _scheduledNodes.add(n.parentNode);
          });
        } else if (rec.type === 'characterData' && rec.target && rec.target.parentNode) {
          _scheduledNodes.add(rec.target.parentNode);
        }
      }
      if (_scheduledNodes.size) scheduleFlush();
    });
    _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    try { replaceAll(); } catch (e) {}
    try { replaceEmojisGlobal(); } catch (e) {}
    try { startObserver(); } catch (e) {}
  }

  window.ICONS = {
    library: ICONS,
    EMOJI_TO_ICON: EMOJI_TO_ICON,
    ICON: ICON,
    replaceAll: replaceAll,
    replaceEmojisInElement: replaceEmojisInElement,
    replaceEmojisGlobal: replaceEmojisGlobal
  };
  window.ICON = ICON;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
