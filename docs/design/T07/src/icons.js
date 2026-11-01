window.IC = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  note: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.2-.5-.5-2.2z"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  skipf: '<path d="M5 4l10 8-10 8zM19 5v14"/>', skipb: '<path d="M19 4L9 12l10 8zM5 5v14"/>', play: '<path d="M6 4l14 8-14 8z"/>', pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};
window.ic = (n, s) => `<svg class="ic" viewBox="0 0 24 24" ${s ? `style="${s}"` : ""}>${IC[n]}</svg>`;
window.tabsHTML = (on) => `<div class="tabs">${[["home", 0], ["bolt", 1], ["clip", 2], ["note", 3], ["tools", 4], ["chip", 5], ["chat", 6]].map(([n, k]) => `<i class="${k === on ? "on" : ""}">${ic(n)}</i>`).join("")}</div>`;
window.eyes = () => `<div class="eyes"><div class="eye"></div><div class="eye"></div></div>`;
window.APPS = [["VS", "#2f80ed"], ["ف", "#27ae60"], ["Ps", "#001e36"], ["Fg", "#a259ff"], ["Ch", "#ea4335"], ["Sp", "#1ed760"], ["Nt", "#222"], ["Wa", "#25d366"]];
