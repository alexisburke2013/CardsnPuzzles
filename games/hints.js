export const HINT_COST = 5;

export function hintButton(label = 'Show a hint', { credits = 0, finished = false } = {}) {
  const disabled = finished || credits < HINT_COST;
  return `<button class="hint-button" data-game-hint aria-label="${label} for ${HINT_COST} credits" ${disabled ? 'disabled' : ''}><span class="hint-icon" aria-hidden="true">✦</span><span>${label}</span><small>${HINT_COST} credits</small></button>`;
}