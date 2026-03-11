const KNOWN_STORAGE_HOSTS = ['supabase.co', 'api.therai.co'];

export default function supabaseLoader({ src, width, quality }: { src: string, width: number, quality?: number }) {
    if (src.startsWith('/')) return src;

    const isKnownHost = KNOWN_STORAGE_HOSTS.some(host => src.includes(host));
    if (!isKnownHost) return src;

    if (src.includes('/storage/v1/object/public/')) {
        const transformedSrc = src.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        const url = new URL(transformedSrc);
        url.searchParams.set('width', width.toString());
        url.searchParams.set('quality', (quality ?? 75).toString());
        return url.toString();
    }

    return src;
}
