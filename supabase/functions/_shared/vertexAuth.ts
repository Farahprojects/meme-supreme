// @ts-nocheck - Deno runtime
// Shared Vertex AI service-account JWT auth for edge functions (Imagen, Veo, etc.)

export interface VertexCreds {
    project_id: string;
    client_email: string;
    private_key: string;
    token_uri: string;
}

const VERTEX_SECRET = Deno.env.get("VERTEX");

function base64urlEncode(data: string | Uint8Array): string {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function signJWT(creds: VertexCreds): Promise<string> {
    const header = base64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = base64urlEncode(JSON.stringify({
        iss: creds.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: creds.token_uri,
        iat: now,
        exp: now + 3600,
    }));

    const signingInput = `${header}.${payload}`;

    const pemBody = creds.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "")
        .replace(/\n/g, "")
        .trim();
    const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        keyDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );

    const sigBytes = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        new TextEncoder().encode(signingInput),
    );

    return `${signingInput}.${base64urlEncode(new Uint8Array(sigBytes))}`;
}

/** Exchange service account JWT for an access token. */
export async function getVertexAccessToken(creds: VertexCreds): Promise<string> {
    const jwt = await signJWT(creds);
    const resp = await fetch(creds.token_uri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });
    const data = await resp.json();
    if (!data.access_token) throw new Error(`Vertex token exchange failed: ${JSON.stringify(data)}`);
    return data.access_token;
}

/** Parse VERTEX env (service account JSON). Returns null if not set or invalid. */
export function getVertexCreds(): VertexCreds | null {
    if (!VERTEX_SECRET) return null;
    const trimmed = VERTEX_SECRET.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
        return JSON.parse(trimmed) as VertexCreds;
    } catch {
        return null;
    }
}

/**
 * Generate a GCS V4 signed download URL for a private GCS object.
 * Returns a URL valid for up to 7 days (GCS maximum).
 */
export async function signGcsDownloadUrl(
    creds: VertexCreds,
    gcsUri: string,
    expiresInSeconds = 604800, // 7 days
): Promise<string> {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);
    const bucket = match[1];
    const objectPath = match[2];

    const now = new Date();
    const dateString = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20240101T000000Z
    const datestamp = dateString.slice(0, 8);

    const credentialScope = `${datestamp}/auto/storage/goog4_request`;
    const credential = `${creds.client_email}/${credentialScope}`;

    // Canonical URI: /bucket/object (each path segment percent-encoded)
    const encodedBucket = encodeURIComponent(bucket);
    const encodedObject = objectPath.split("/").map((p) => encodeURIComponent(p)).join("/");
    const canonicalUri = `/${encodedBucket}/${encodedObject}`;

    // Canonical query string — sorted alphabetically, values percent-encoded
    const queryPairs: [string, string][] = [
        ["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
        ["X-Goog-Credential", credential],
        ["X-Goog-Date", dateString],
        ["X-Goog-Expires", String(expiresInSeconds)],
        ["X-Goog-SignedHeaders", "host"],
    ];
    queryPairs.sort(([a], [b]) => a.localeCompare(b));
    const canonicalQueryString = queryPairs
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    const canonicalHeaders = "host:storage.googleapis.com\n";
    const signedHeaders = "host";

    const canonicalRequest = [
        "GET",
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        "UNSIGNED-PAYLOAD",
    ].join("\n");

    const canonicalHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest));
    const canonicalHashHex = Array.from(new Uint8Array(canonicalHash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const stringToSign = [
        "GOOG4-RSA-SHA256",
        dateString,
        credentialScope,
        canonicalHashHex,
    ].join("\n");

    const pemBody = creds.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "")
        .replace(/\n/g, "")
        .trim();
    const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        keyDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sigBytes = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        new TextEncoder().encode(stringToSign),
    );
    const sigHex = Array.from(new Uint8Array(sigBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    return `https://storage.googleapis.com${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${sigHex}`;
}
