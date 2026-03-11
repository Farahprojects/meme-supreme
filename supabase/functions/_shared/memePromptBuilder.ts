// Shared prompt builder for meme generation (memeroast-worker, library-seeder, future subscription flow)

export const STYLES = {
    y2k: "Y2K Flash / Retro Digicam. Nostalgic and playful: disposable camera aesthetic, flash blown out, slightly messy, early 2000s digicam. Harsh on-camera flash, overexposed highlights, grain, candid snapshot energy.",
    fashion: "High-End Editorial Fashion Shoot. Ultra-sharp, premium studio lighting, dramatic shadows, glossy magazine aesthetic, hyper-detailed, bold fashion styling, confident posture, cinematic 8k resolution.",
    cinematic: "Cinematic Dreamy Portrait. Soft beautiful lighting, golden hour glow or gentle diffused studio light, sharp focus on subject with shallow depth of field (bokeh background), warm and inviting atmosphere, highly detailed.",
};

export function buildMemeRoastPrompt(
    targetNames: string,
    contextDescription: string,
    optionalDate: string | undefined,
    tone: string = 'roast',
    styleDescription: string
): string {
    const signInfo = optionalDate ? `
Birth Data: ${optionalDate}
[ASTROLOGY INSTRUCTION: Birth data was provided! Infer their likely astrological sign and placements based on this date. CRITICAL: DO NOT use any direct astrology jargon in the final output (e.g., do not say "Scorpio", "Mercury", "Venus", "Retrograde", "Moon sign"). Translate the astrological placements into personality traits that fit the requested Tone.]` : '';

    let toneRules = "";
    const normalizedTone = tone.toLowerCase();

    if (normalizedTone === "roast") {
        toneRules = `
- Write a roast caption that makes people stop scrolling and say "LMAO that's so true."
- A great roast = one SPECIFIC behaviour or quirk + an unexpected but undeniable truth about it.
- The target should laugh too. This is affectionate mockery, not an attack.
- STRUCTURE TO AIM FOR: call out a specific action or habit → land the absurd but true punchline. Example format: "does [specific thing] then acts like [unexpected contrast]" or "[specific behaviour] energy but [ironic truth]."
- AVOID THE OBVIOUS ANGLE. Never write the first joke that comes to mind (e.g. if the topic is a brand, do NOT write a price complaint — dig one level deeper into the behaviour of the people who use it).
- Dig into: the gap between who they think they are vs what they actually do. The self-delusion. The ritual. The habit they'd never admit.
- Keep it SHORT. The best roast captions land in 6–10 words. Punchy always beats clever-but-long.
- SAFETY: Never attack physical appearance, race, body, age, gender, mental health, or worth as a person. Roast the CHOICES and BEHAVIOURS only.`;
    } else if (normalizedTone === "funny") {
        toneRules = `
- Write a caption that makes someone laugh out loud, then immediately send it to a group chat.
- Funny is NOT roast — there is no dig, no target. Everyone is in on the joke together. Celebrate the chaos of the situation, not a flaw in a person.
- The best funny captions find the ABSURD TRUTH in a completely normal situation. The joke lives in how accurate it is — the "why is this so real" reaction.
- AVOID generic "when you..." openers — they're overused and weak. Find a more unexpected angle in.
- The formula: spot the most specific, unexpected detail in the context → describe it in a way that makes the absurdity obvious. The more specific, the funnier.
- Chaotic energy is welcome. The image and caption should feel slightly unhinged in a harmless way — like something that escalated for no reason.
- Keep it SHORT. 6–10 words. Funny that needs explaining isn't funny.
- Completely harmless. No target, no dig, just the beautiful chaos of the situation.`;
    } else if (normalizedTone === "sweet") {
        toneRules = `
- Write a caption that captures the feeling of being truly SEEN by someone who knows you well.
- NOT romantic declarations or love confessions. NOT "you light up my world" or "I love you" phrases. This must stay UNIVERSAL — it should work equally for a couple, best friends, siblings, or a parent and child.
- The best sweet captions celebrate a SPECIFIC HABIT or QUIRK that makes someone irreplaceable. Not "you're amazing" — but "the one who [does that specific thing]."
- Aim for the "that's SO them" reaction — the reader should instantly picture their person.
- A touch of warmth + a hint of gentle humour is perfect. Sweet doesn't mean saccharine.
- STRUCTURE TO AIM FOR: name the specific behaviour → let the warmth land naturally. Example formats: "the one who [specific thing they always do]" or "never says much but [specific quiet action]" or "does [small thing] like it costs nothing — it costs everything."
- Keep it SHORT. 6–10 words. The best sweet captions feel effortless, not written.`;
    } else if (normalizedTone === "bold") {
        toneRules = `
- Write a caption where the ENERGY is completely disproportionate to the situation — and that's the joke.
- Bold is not a motivational poster. Do NOT write "born to win", "no apologies", "unstoppable", or generic power statements. Those are clichés, not memes.
- The formula: take a SPECIFIC ordinary action or decision from the context → describe it like it's a historic power move.
- The subject is completely serious. The humour comes from the gap between how BIG they're acting and how SMALL the situation actually is.
- STRUCTURE TO AIM FOR: describe a normal action as if it changed the room → or treat a mundane choice like it took serious nerve. Examples: "walked in like [normal thing] was already handled" or "did [small thing] and felt nothing" or "[ordinary decision]. didn't flinch."
- No self-deprecation. No weakness. They are the main character and they know it — but it should make the viewer laugh, not cringe.
- Keep it SHORT and declarative. 5–8 words. Bold captions hit hard and stop. No build-up.`;
    } else {
        toneRules = `
- Based on the user's provided context, write a meme caption that captures the requested tone: ${normalizedTone}.`;
    }

    return `You are an expert modern meme creator. Return ONLY strict JSON.

TARGET(S): ${targetNames}${signInfo}
REQUESTED TONE: ${normalizedTone.toUpperCase()}

USER PROVIDED CONTEXT FOR THE MEME:
"${contextDescription}"

SCENE STYLE (locked; must be followed exactly):
${styleDescription}

RULES:${toneRules}
- CRITICAL NO-CELEBRITIES RULE: NEVER use names of real celebrities, public figures, politicians, or copyrighted characters (e.g., Zendaya, Gordon Gekko, Elon Musk) in the imagePrompt. It will instantly trigger AI safety filters and hard-fail. Describe generic outfits, styles, or vibes instead.
- CRITICAL IMAGE SAFETY RULES (violations cause hard failures): NEVER reference brand names, apps, or platforms (e.g. Discord, Instagram, TikTok, Netflix) in the imagePrompt. NEVER reference specific internet meme formats or characters (e.g. Doge, Shiba Inu, specific meme templates).
- Caption must read like a modern internet meme.
- No hashtags, no emojis.
- Then: Generate an image prompt that makes the caption land perfectly.
- Image must be a LITERAL scene that matches the joke and the tone. No text in the image.
- Describe concrete objects + actions + facial expressions + setting based on the context.
- 3:4 portrait, full-bleed edge-to-edge. No borders/frames.

OUTPUT FORMAT:
{
  "caption": "your caption (<=15 words)",
  "imagePrompt": "STYLE: [repeat the style in your own words] | SETTING: [specific place] | PEOPLE: [${targetNames}] | ACTION: [what they are doing] | EXPRESSIONS: [faces] | PROPS: [key objects] | CAMERA: [shot type, lens vibe] | LIGHTING: [matches style] | COMPOSITION: 3:4 vertical, full-bleed edge-to-edge, subject in focus, no text"
}`;
}
