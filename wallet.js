/*
 * SHARED WALLET
 * Keep all earned credits and purchases in this profile wallet. Game rules request
 * a spend through app helpers; games must never mutate profile credits directly.
 */
export function normalizeWalletProfile(profile = {}, starterCredits = 15) {
  const legacyBalance = Number(profile.points);
  const balance = profile.credits ?? (legacyBalance > 0 ? legacyBalance : starterCredits);
  const normalized = { ...profile, credits: Math.max(0, Math.floor(Number(balance) || 0)) };
  delete normalized.points;
  return normalized;
}

export function spendCredits(profile, amount) {
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (profile.credits < cost) return false;
  profile.credits -= cost;
  return true;
}

export function awardCredits(profile, amount) {
  const reward = Math.max(0, Math.floor(Number(amount) || 0));
  profile.credits += reward;
  return profile.credits;
}