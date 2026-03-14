// Carousel prompt builder — 6-slide structures for Teach, Story, Authority

export type CarouselFormat = "teach" | "story" | "authority";

const SHARED_STYLE =
    "High-quality editorial, clean backgrounds, professional lighting. Cohesive visual style: same colour palette and aesthetic across all 6 slides so the carousel feels like one piece.";

const FORMAT_STRUCTURES: Record<
    CarouselFormat,
    { slide1: string; slides2to5: string; slide6: string; example: string }
> = {
    teach: {
        slide1: "Hook — a punchy statement or question that stops the scroll",
        slides2to5: "Tips or steps — one key idea per slide, actionable and clear",
        slide6: "Summary — recap or call to action",
        example: "5 mistakes in bathroom renovations",
    },
    story: {
        slide1: "Hook — draw readers into the narrative",
        slides2to5: "Timeline or narrative — the journey, one beat per slide",
        slide6: "Lesson — the takeaway or moral",
        example: "How we went from empty restaurant to booked out",
    },
    authority: {
        slide1: "Strong statement — a bold belief or contrarian view",
        slides2to5: "Supporting ideas — evidence, examples, or arguments",
        slide6: "Punchline — the payoff or final twist",
        example: "Most businesses fail on social media for one reason",
    },
};

function getToneRules(tone: string): string {
    const t = tone.toLowerCase();
    if (t === "roast") {
        return `
- ROAST TONE (applies to all 6 slides): Witty, sharp, calls out industry tropes or shared behaviours.
- CRITICAL: Roast the INDUSTRY TROPE, SHARED BEHAVIOUR, or RELATABLE SITUATION — never the brand or person directly. The brand/person is IN ON THE JOKE, not the butt of it. They should want to repost this themselves.
- Think of it as: the brand laughing at its own customers, its own industry, or the ridiculous situations that come with what they do. Not self-deprecation — self-awareness.
- slide_text: Each slide lands a specific shared behaviour or cultural truth. AVOID THE OBVIOUS ANGLE. Dig one level deeper — habits, rituals, unspoken rules.
- Keep slide_text SHORT and punchy. 6–15 words per slide. Scannable. No hashtags, no emojis.
- SAFETY: Never attack appearance, race, body, age, gender, mental health, or personal worth. Roast the SITUATION and SHARED BEHAVIOURS only.`;
    }
    if (t === "funny") {
        return `
- FUNNY TONE (applies to all 6 slides): Light-hearted, humorous, celebrates the chaos.
- Funny is NOT roast — there is no dig, no target. Everyone is in on the joke together. Celebrate the chaos of the situation, not a flaw in a person.
- slide_text: Find the ABSURD TRUTH in completely normal situations. The joke lives in how accurate it is — the "why is this so real" reaction.
- AVOID generic "when you..." openers. Find unexpected angles. Chaotic energy is welcome — slightly unhinged in a harmless way.
- Keep slide_text SHORT. 6–15 words per slide. Funny that needs explaining isn't funny. No hashtags, no emojis.
- Completely harmless. No target, no dig, just the beautiful chaos of the situation.`;
    }
    if (t === "sweet") {
        return `
- SWEET TONE (applies to all 6 slides): Warm, genuine, celebrates people and moments.
- NOT romantic declarations or love confessions. NOT "you light up my world" or "I love you" phrases. Must stay UNIVERSAL — works for couples, best friends, siblings, parent and child.
- slide_text: Celebrate SPECIFIC HABITS or QUIRKS that make someone irreplaceable. Not "you're amazing" — "the one who [does that specific thing]."
- Aim for the "that's SO them" reaction — the reader instantly pictures their person.
- A touch of warmth + a hint of gentle humour. Sweet doesn't mean saccharine.
- Keep slide_text SHORT. 6–15 words per slide. Effortless, not written. No hashtags, no emojis.`;
    }
    if (t === "bold") {
        return `
- BOLD TONE (applies to all 6 slides): The ENERGY is completely disproportionate to the situation — and that's the joke.
- Bold is NOT a motivational poster. Do NOT write "born to win", "no apologies", "unstoppable", or generic power statements. Those are clichés.
- slide_text: Take a SPECIFIC ordinary action or decision from the context → describe it like it's a historic power move.
- The subject is completely serious. The humour comes from the gap between how BIG they're acting and how SMALL the situation actually is.
- STRUCTURE: describe a normal action as if it changed the room, or treat a mundane choice like it took serious nerve.
- Keep slide_text SHORT and declarative. 5–12 words per slide. Bold captions hit hard and stop. No build-up. No hashtags, no emojis.`;
    }
    return `
- Match the requested tone: ${tone}.
- slide_text: punchy, scannable. No hashtags, no emojis. Max ~50 words per slide.`;
}

export function buildCarouselPrompt(
    format: CarouselFormat,
    contextDescription: string,
    tone: string
): string {
    const struct = FORMAT_STRUCTURES[format];
    const normalizedTone = tone.toLowerCase();
    const toneRules = getToneRules(normalizedTone);

    return `Create a 6-slide carousel for social media. Return ONLY valid JSON.

TOPIC / WHAT IT'S ABOUT:
"${contextDescription}"

FORMAT: ${format.toUpperCase()}
- Slide 1: ${struct.slide1}
- Slides 2–5: ${struct.slides2to5}
- Slide 6: ${struct.slide6}

Example idea: "${struct.example}"

REQUESTED TONE: ${normalizedTone.toUpperCase()}

TONE-SPECIFIC RULES (follow exactly):${toneRules}

RULES (all tones):
- CRITICAL: All 6 imagePrompt values MUST share the SAME visual style. Use this base for every slide: "${SHARED_STYLE}". Adapt the scene (setting, people, action) per slide but keep the palette and aesthetic identical.
- CRITICAL NO-CELEBRITIES: NEVER use names of real celebrities, public figures, politicians, or copyrighted characters in imagePrompt. Describe generic styles/vibes instead.
- CRITICAL IMAGE SAFETY: NEVER reference brand names, apps, or platforms (Discord, Instagram, TikTok, Netflix) in imagePrompt. NEVER reference specific meme formats or characters.
- slide_text: the copy for that slide — punchy, scannable, works on its own. No hashtags, no emojis. Max ~50 words per slide.
- imagePrompt: a detailed scene description for AI image generation. 3:4 portrait. No text in the image. Full-bleed edge-to-edge. Start each with: "STYLE: ${SHARED_STYLE} | " then add SETTING, PEOPLE/OBJECTS, ACTION, LIGHTING, COMPOSITION.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "slides": [
    { "slide_text": "...", "imagePrompt": "STYLE: ... | SETTING: ... | ..." },
    { "slide_text": "...", "imagePrompt": "STYLE: ... | SETTING: ... | ..." },
    { "slide_text": "...", "imagePrompt": "STYLE: ... | SETTING: ... | ..." },
    { "slide_text": "...", "imagePrompt": "STYLE: ... | SETTING: ... | ..." },
    { "slide_text": "...", "imagePrompt": "STYLE: ... | SETTING: ... | ..." },
    { "slide_text": "...", "imagePrompt": "STYLE: ... | SETTING: ... | ..." }
  ]
}`;
}

export const CAROUSEL_SYSTEM_INSTRUCTION =
    "You are an expert carousel copywriter and visual director. You write scroll-stopping slide copy and precise AI image prompts. Every carousel must feel cohesive — same visual style across all 6 slides. Return ONLY valid JSON — no markdown, no explanation.";
