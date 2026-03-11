import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const supabaseUrl = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in environment");
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadLogo() {
    try {
        const fileBytes = await Deno.readFile("./public/assets/logo_white.png");

        const { data, error } = await supabase.storage
            .from("generated-images")
            .upload("system/logo_white.png", fileBytes, {
                contentType: "image/png",
                upsert: true
            });

        if (error) {
            console.error("Upload failed:", error);
            return;
        }

        const { data: publicUrlData } = supabase.storage
            .from("generated-images")
            .getPublicUrl("system/logo_white.png");

        console.log("SUCCESS:", publicUrlData.publicUrl);
    } catch (err) {
        console.error("Error:", err);
    }
}

uploadLogo();
