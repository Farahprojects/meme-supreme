// Unified astrological position formatting utilities for Supabase functions
// Handles positions with {deg: number (0-30), sign: string} format
// DECIMAL-ONLY: No minutes conversion, displays exact decimal degrees

export type ZodiacPos = { 
  deg?: number; 
  sign?: string; 
};

/**
 * Format decimal degrees as exact decimal (e.g., 11.83 → "11.83°", 27.06 → "27.06°")
 * No minutes conversion - displays positions exactly as provided by Swiss payload
 */
export function formatDegDecimal(dec?: number): string {
  if (typeof dec !== "number" || !isFinite(dec)) return "—";
  
  return `${dec.toFixed(2)}°`;
}

/**
 * Format a zodiac position as decimal degrees in sign (e.g., "11.83° in Gemini")
 * Returns "—" for invalid/missing data to avoid undefined/NaN display
 */
export function formatPosDecimal(p?: ZodiacPos): string {
  if (!p || typeof p.deg !== "number" || !p.sign) return "—";
  
  return `${formatDegDecimal(p.deg)} in ${p.sign}`;
}

// DEPRECATED: Legacy minutes-based formatters - use decimal versions instead
/**
 * @deprecated Use formatDegDecimal instead - this adds unnecessary minutes conversion
 */
export function formatDegMin(dec?: number): string {
  if (typeof dec !== "number" || !isFinite(dec)) return "—";
  
  const d = Math.floor(dec);
  const m = Math.floor((dec - d) * 60);
  
  return `${d}°${String(m).padStart(2, "0")}'`;
}

/**
 * @deprecated Use formatPosDecimal instead - this adds unnecessary minutes conversion
 */
export function formatPos(p?: ZodiacPos): string {
  if (!p || typeof p.deg !== "number" || !p.sign) return "—";
  
  return `${formatDegMin(p.deg)} in ${p.sign}`;
}

/**
 * @deprecated Use formatPosDecimal instead - this adds unnecessary minutes conversion
 */
export function formatPosWithHouse(p?: ZodiacPos & { house?: number; natal_house?: number }): string {
  const basePos = formatPos(p);
  if (basePos === "—") return basePos;
  
  let houseLabel = "";
  if (p?.house) {
    houseLabel = ` (House ${p.house})`;
  } else if (p?.natal_house) {
    houseLabel = ` (Natal House ${p.natal_house})`;
  }
  
  return basePos + houseLabel;
}
