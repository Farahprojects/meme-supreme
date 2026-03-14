# Deploy — Meme Supreme

Use this document when deploying the Meme Supreme app. Any platform or AI should follow these steps exactly.

---

## Prerequisites

- **Node.js** (v18+)
- **Supabase CLI** (`npm install -g supabase` or `npx supabase`)
- **Git** (for pushing to trigger Vercel)
- **Environment**: Run all commands from the **project root** (the folder containing `package.json` and `supabase/`).

---

## 1. Deploy Supabase Edge Functions

From the project root:

```bash
# Deploy a single function (e.g. after fixing studio-image-edit)
npx supabase functions deploy studio-image-edit

# Deploy all edge functions
npx supabase functions deploy
```

**Edge functions in this project:**

- `studio-image-edit` — image editing (Imagen)
- `studio-generator` — studio image generation
- `memesupreme-auth` — auth
- `memesupreme-create-checkout` — Stripe checkout
- `memesupreme-stripe-webhook` — Stripe webhooks
- `memeroast-worker` — memeroast
- `outbound-messenger` — messaging
- `library-bind` — library
- `library-seeder` — library seed

**Supabase project:** `cossyqsvqxatbbhysdur`  
**Dashboard:** https://supabase.com/dashboard/project/cossyqsvqxatbbhysdur/functions

---

## 2. Deploy Frontend (Vercel)

The frontend deploys automatically when you push to `main`.

```bash
git add .
git commit -m "Your message"
git push origin main
```

Vercel will build and deploy. No manual deploy step unless you use Vercel CLI (`vercel --prod`).

---

## 3. Environment Variables

**Frontend (Vercel / `.env.local`):**

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key

**Supabase Edge Functions (set in Dashboard → Project Settings → Edge Functions → Secrets):**

- `SUPABASE_URL` — same as above (often auto-set)
- `SUPABASE_ANON_KEY` — anon key
- `GOOGLE-MEME` — Google API key (for Imagen / studio-image-edit, studio-generator)
- `CUSTOM_DOMAIN` — (optional) custom storage URL for public image URLs

---

## 4. Quick reference

| What to deploy      | Command / action                                      |
|---------------------|--------------------------------------------------------|
| One edge function   | `npx supabase functions deploy <function-name>`       |
| All edge functions  | `npx supabase functions deploy`                       |
| Frontend            | `git push origin main` (Vercel auto-deploys)          |

---

## 5. After changing only `studio-image-edit`

1. Deploy the function:
   ```bash
   npx supabase functions deploy studio-image-edit
   ```
2. If you changed frontend code too, push to `main` so Vercel deploys.

No database migrations or other steps are required for function-only changes.
