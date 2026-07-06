'use strict';

// ── Minigame registry & Games picker ─────────────────────────────────────────
// (extracted from minigames.js so the registry's host isn't "also a game")
//
// Each game file adds an entry at script-eval time:
//   window.MINIGAMES.key = { name, emoji, start, best? }
// `best` is an optional getter returning a short trophy string ('Lv 4',
// '3/10 songs') shown in the picker — the trophy shelf kids actually look at.
// The picker itself is (re)built on every open so the badges stay fresh.

window.MINIGAMES = window.MINIGAMES || {};

(function () {

let pickerEl = null;

function buildGamePicker() {
  const grid = document.getElementById('minigame-grid');
  grid.innerHTML = '';
  Object.keys(window.MINIGAMES).forEach(key => {
    const game = window.MINIGAMES[key];
    const btn = document.createElement('button');
    btn.className = 'dance-option';
    btn.setAttribute('aria-label', 'Play ' + game.name);
    const trophy = game.best ? game.best() : '';
    btn.innerHTML = '<span class="dance-emoji" aria-hidden="true">' + game.emoji + '</span>' +
                    '<span class="dance-name">' + game.name + '</span>' +
                    (trophy ? '<span class="dance-meta">\u{1F3C6} ' + trophy + '</span>' : '');
    btn.addEventListener('click', () => {
      closeGamePicker();
      game.start();
    });
    grid.appendChild(btn);
  });
}

function openGamePicker() {
  buildGamePicker();
  openOverlay(pickerEl, closeGamePicker);
}

function closeGamePicker() {
  closeOverlay(pickerEl);
}

function initGames() {
  pickerEl = document.getElementById('minigame-picker');
  document.getElementById('btn-play').addEventListener('click', () => {
    pulse('btn-play');
    openGamePicker();
  });
  document.getElementById('minigame-picker-close').addEventListener('click', closeGamePicker);
  pickerEl.addEventListener('click', e => {
    if (e.target.id === 'minigame-picker') closeGamePicker();
  });
}

document.addEventListener('DOMContentLoaded', initGames);

})();
