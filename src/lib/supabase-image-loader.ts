export default function supabaseLoader({ src, width, quality }: { src: string, width: number, quality?: number }) {
    // If the image is not from Supabase or it's a relative path, return as is
    if (!src.includes('supabase.co') || src.startsWith('/')) {
        return src;
    }

    // Supabase Image Transformation URL format:
    // https://<project_id>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=<width>&quality=<quality>

    // Example original URL:
    // https://wrvqqvqvwqmfdqvqmaar.supabase.co/storage/v1/object/public/memeroast-images/image.jpg

    if (src.includes('/storage/v1/object/public/')) {
        const transformedSrc = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        const url = new URL(transformedSrc);
        url.searchParams.set('width', width.toString());
        if (quality) {
            url.searchParams.set('quality', quality.toString());
        } else {
            url.searchParams.set('quality', '75'); // Default quality
        }
        return url.toString();
    }

    return src;
}
