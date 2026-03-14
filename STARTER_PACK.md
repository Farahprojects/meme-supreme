# Meme Supreme — Starter Pack Spec

> This document defines the free tier and Starter Pack in full.
> Use it as the source of truth for product, engineering, and pricing decisions.

---

## Free Tier — For Everyone

No account required. No payment. No friction.

### What's free

- Access to the **Meme Library** — a curated set of pre-generated images
- Pick any image from the library
- **Edit the caption** — rewrite, shorten, brand-safe — unlimited
- **Bind** the final caption to the image (adds watermark: `www.memesupreme.co`)
- Download the finished PNG

### Why it exists

The free tier is the acquisition engine.
Every image that leaves the product carries the watermark.
Every person who uses the free tier sees what a generated image looks like.
The natural next question is: *"Can I generate one for my own brand?"*
That question is what sells the Starter Pack.

### What free does NOT include

- Generating new images from a prompt
- Choosing a tone (Funny, Roast, Sweet, Bold)
- Image edits (tweaking, regenerating, changing background)
- ZIP or batch exports

---

## Starter Pack — $19/month

**Built for:** solo creators, freelancers, and social managers who want consistent weekly output without thinking about credits.

---

### The numbers that matter

**48 images per month** — 12 per week, one sitting per week.

**5 reels per month** *(Beta)* — AI-scripted 8–15 second reels. Priced conservatively while Veo is in preview.

That maps directly to how creators and social managers plan content.
Weekly batches. One sitting. Done.

---

### How generation works

One **generation run** takes a single prompt and produces:

| Output | Detail |
|---|---|
| 4 images | One per tone: Funny, Roast, Sweet, Bold |
| 4 captions | One per image, generated to match the tone |

The subscriber picks their favourite. Edits the caption freely. Binds and downloads. Done.

**12 generation runs per month = 48 images per month.**

---

### Included each month

| Feature | Amount |
|---|---|
| Generation runs | 12 |
| Total images generated | 48 |
| Image tweaks & edits | Unlimited |
| Caption rewrites | Unlimited |
| Reels (Beta) | 5 per month |
| PNG export | Included |
| Output format | 4:5 Instagram-ready |

---

### Why unlimited edits

Image editing (vibe tweaks, product insertion, background changes) costs very little per call.
Capping edits creates unnecessary friction — users should be able to refine freely.
The generation run count (12/month) is the natural throttle.

---

### What is a reel

One reel = one AI-scripted video:
- **Single reel**: 8 seconds
- **Continuous reel**: 15 seconds (8s + 7s extension, counts as 1)

Each reel is generated from a Gemini-scripted prompt based on user description + goal.
Cost to us: ~$0.40/reel. Beta allowance: 5/month.

---

## Pricing rationale

| Tool | Plan | Price |
|---|---|---|
| Midjourney | Basic | $10/month |
| Midjourney | Standard | $30/month |
| Adobe Express | Premium | $9.99/month |
| Canva | Pro | ~$15/month |
| **Meme Supreme** | **Starter** | **$19/month** |

$19 sits comfortably in the creative tools band that individual creators already pay.
It is not a commitment that requires justification — it is a subscription that pays for itself with one piece of content that performs.

---

## What comes after Starter

The Starter Pack is Pack 1 of 3.

| Tier | Target | Output |
|---|---|---|
| Free | Anyone | Library images + caption edits |
| Starter — $19/month | Solo creators, freelancers, social managers | 40 memes/month |
| Growth — TBD | Small teams, agencies | TBD — higher volume, team seats |
| Brand — TBD | Businesses, brands | TBD — custom styles, priority gen |

---

## Open questions before build

- [ ] Does the Meme Library need curation tooling, or is it seeded manually at launch?
- [ ] Is binding in the free tier limited to library images only, or can free users bind their own uploaded image?
- [ ] Does the ZIP export include captions as a text file alongside the images?
- [ ] What happens to unused runs at month end — do they roll over or reset?

---

*Last updated: March 2026*
