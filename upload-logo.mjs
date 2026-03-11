import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in environment");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadLogo() {
    try {
        const fileBytes = fs.readFileSync("./public/assets/logo_white.png");

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
